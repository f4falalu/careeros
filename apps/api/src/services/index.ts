import { db } from '../db/index.js'
import { GraphService } from './graph.js'
import { MemoryService } from './memory.js'
import { ConversationService } from './conversation.js'

// Singletons — instantiated once at startup, imported everywhere
export const graphService = new GraphService(db)
export const memoryService = new MemoryService(db, graphService)
export const conversationService = new ConversationService(db, memoryService)
