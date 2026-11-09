// The dashboard's sections, in page order. The sidebar, the section observer and the search
// all read this list; `aliases` are other words the search finds a section by.
export const SECTIONS = [
  { id: 'body',        label: 'Body',         icon: '⚖️', accent: '#7c3aed', aliases: ['body composition', 'inbody', 'scale'] },
  { id: 'sleep',       label: 'Sleep',        icon: '🌙', accent: '#60a5fa', aliases: ['rest', 'nights'] },
  { id: 'exercise',    label: 'Exercise',     icon: '🏃', accent: '#f97316', aliases: ['workouts', 'training', 'fitness'] },
  { id: 'heartrate',   label: 'Heart Rate',   icon: '❤️', accent: '#f43f5e', aliases: ['pulse', 'cardio'] },
  { id: 'applehealth', label: 'Apple Health', icon: '📈', accent: '#38bdf8', aliases: ['activity', 'vitals', 'health auto export'] },
  { id: 'labs',        label: 'Labs',         icon: '🧪', accent: '#34d399', aliases: ['blood', 'blood test', 'bloodwork', 'lab results', 'markers'] },
  { id: 'dna',         label: 'DNA',          icon: '🧬', accent: '#22d3ee', aliases: ['genetics', 'genes', 'snp'] },
  { id: 'events',      label: 'Events',       icon: '📅', accent: '#f59e0b', aliases: ['timeline', 'notes'] },
  { id: 'protocols',   label: 'Protocols',    icon: '📋', accent: '#a78bfa', aliases: ['supplements', 'regimen'] },
  { id: 'import',      label: 'Import',       icon: '↑',  accent: '#a78bfa', aliases: ['upload', 'pdf', 'health records'] },
]

// The element id of one metric's card, which the search scrolls to.
export const metricAnchor = (section, key) => `m-${section}-${key}`
