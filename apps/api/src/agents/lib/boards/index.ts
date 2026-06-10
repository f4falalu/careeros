export interface BoardFilters {
  keywords?: string[]
  category?: string
  minSalary?: number
  regions?: string[]
}

export interface NormalizedJob {
  externalId: string
  companyName: string
  roleTitle: string
  location?: string
  workModel: 'remote' | 'hybrid' | 'onsite' | 'unknown'
  salaryText?: string
  requiredSkills: string[]
  description: string
  applyUrl: string
  sourceUrl: string
  postedAt?: string
}

export interface JobBoardAdapter {
  board: string
  fetch(filters: BoardFilters): Promise<NormalizedJob[]>
}

export function guessWorkModel(text: string): 'remote' | 'hybrid' | 'onsite' | 'unknown' {
  const t = text.toLowerCase()
  if (t.includes('hybrid')) return 'hybrid'
  if (t.includes('remote') || t.includes('worldwide') || t.includes('anywhere')) return 'remote'
  if (t.includes('onsite') || t.includes('on-site') || t.includes('in-office')) return 'onsite'
  return 'unknown'
}

export function extractSkills(text: string): string[] {
  const known = [
    'TypeScript','JavaScript','Python','Go','Rust','Java','C++','Ruby','PHP','Swift','Kotlin',
    'React','Vue','Angular','Next.js','Svelte','Node.js','Express','FastAPI','Django','Rails',
    'PostgreSQL','MySQL','MongoDB','Redis','Elasticsearch','Kafka','RabbitMQ',
    'AWS','GCP','Azure','Docker','Kubernetes','Terraform','CI/CD','GitHub Actions',
    'GraphQL','REST','gRPC','WebSockets','SQL','NoSQL','Git',
    'Machine Learning','LLMs','PyTorch','TensorFlow','Pandas','NumPy',
  ]
  return known.filter((s) => text.includes(s))
}
