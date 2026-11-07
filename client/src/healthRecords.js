// Reads FHIR health records out of what the iPhone Health app's "Export All Health Data"
// produces: the export zip itself, a zip of its clinical-records folder, or loose .json
// files from that folder.
//
// The export zip runs to hundreds of megabytes, nearly all of it export.xml. Only the zip's
// directory and the clinical-records/*.json entries are read, each with File.slice, so the
// rest is never loaded into memory. Entries are inflated with the browser's own
// DecompressionStream, so this needs no zip library.

const EOCD = 0x06054b50
const CENTRAL = 0x02014b50
const LOCAL = 0x04034b50
const ZIP64_LOCATOR = 0x07064b50
const ZIP64_EOCD = 0x06064b50
const MAX32 = 0xffffffff

async function view(file, start, end) {
  return new DataView(await file.slice(start, end).arrayBuffer())
}

async function zipEntries(file) {
  // The end-of-central-directory record is the last 22 bytes, plus a comment of up to
  // 64 KB, plus the 20-byte ZIP64 locator just before it when there is one.
  const tailStart = Math.max(0, file.size - (22 + 0xffff + 20))
  const tail = await view(file, tailStart, file.size)
  let eocd = -1
  for (let i = tail.byteLength - 22; i >= 0; i--) {
    if (tail.getUint32(i, true) === EOCD) { eocd = i; break }
  }
  if (eocd < 0) throw new Error(`${file.name} is not a zip file`)

  let count = tail.getUint16(eocd + 10, true)
  let dirSize = tail.getUint32(eocd + 12, true)
  let dirOffset = tail.getUint32(eocd + 16, true)
  if (count === 0xffff || dirSize === MAX32 || dirOffset === MAX32) {
    const loc = eocd - 20
    if (loc < 0 || tail.getUint32(loc, true) !== ZIP64_LOCATOR) throw new Error(`${file.name}: unsupported zip`)
    const at = Number(tail.getBigUint64(loc + 8, true))
    const z = await view(file, at, at + 56)
    if (z.getUint32(0, true) !== ZIP64_EOCD) throw new Error(`${file.name}: unsupported zip`)
    count = Number(z.getBigUint64(32, true))
    dirSize = Number(z.getBigUint64(40, true))
    dirOffset = Number(z.getBigUint64(48, true))
  }

  const dir = await view(file, dirOffset, dirOffset + dirSize)
  const names = new TextDecoder()
  const entries = []
  let p = 0
  for (let n = 0; n < count && p + 46 <= dir.byteLength && dir.getUint32(p, true) === CENTRAL; n++) {
    const method = dir.getUint16(p + 10, true)
    let packed = dir.getUint32(p + 20, true)
    let size = dir.getUint32(p + 24, true)
    const nameLen = dir.getUint16(p + 28, true)
    const extraLen = dir.getUint16(p + 30, true)
    const commentLen = dir.getUint16(p + 32, true)
    let offset = dir.getUint32(p + 42, true)
    const name = names.decode(new Uint8Array(dir.buffer, dir.byteOffset + p + 46, nameLen))

    // The ZIP64 extra field carries the real value of each field above that reads 0xFFFFFFFF,
    // in this order.
    for (let e = p + 46 + nameLen, end = e + extraLen; e + 4 <= end; e += 4 + dir.getUint16(e + 2, true)) {
      if (dir.getUint16(e, true) !== 0x0001) continue
      let q = e + 4
      if (size === MAX32) { size = Number(dir.getBigUint64(q, true)); q += 8 }
      if (packed === MAX32) { packed = Number(dir.getBigUint64(q, true)); q += 8 }
      if (offset === MAX32) { offset = Number(dir.getBigUint64(q, true)) }
    }
    entries.push({ name, method, packed, size, offset })
    p += 46 + nameLen + extraLen + commentLen
  }
  return entries
}

async function entryText(file, entry) {
  // Sizes come from the central directory: the Health app writes its entries with a
  // trailing data descriptor, so the local header's size fields are zero.
  const local = await view(file, entry.offset, entry.offset + 30)
  if (local.getUint32(0, true) !== LOCAL) throw new Error(`${file.name}: damaged entry ${entry.name}`)
  const start = entry.offset + 30 + local.getUint16(26, true) + local.getUint16(28, true)
  const data = file.slice(start, start + entry.packed)
  if (entry.method === 0) return data.text()
  if (entry.method !== 8) throw new Error(`${file.name}: ${entry.name} uses an unsupported compression`)
  return new Response(data.stream().pipeThrough(new DecompressionStream('deflate-raw'))).text()
}

function isJson(name) {
  const base = name.split('/').pop()
  return base.toLowerCase().endsWith('.json') && !base.startsWith('._') && !name.includes('__MACOSX/')
}

export const isHealthRecordsFile = file => /\.(zip|json)$/i.test(file.name)

// → { resources, unreadable }: the parsed JSON of every record file, and how many failed to parse.
export async function readHealthRecords(files) {
  const resources = []
  let unreadable = 0
  const add = text => {
    try { resources.push(JSON.parse(text)) } catch { unreadable++ }
  }
  for (const file of files) {
    if (/\.zip$/i.test(file.name)) {
      const json = (await zipEntries(file)).filter(e => isJson(e.name))
      // In the Health app's export the records live under clinical-records/.
      const records = json.filter(e => e.name.includes('clinical-records/'))
      for (const e of records.length ? records : json) add(await entryText(file, e))
    } else if (/\.json$/i.test(file.name)) {
      add(await file.text())
    }
  }
  return { resources, unreadable }
}
