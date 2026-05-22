/**
 * District factory dispatcher.
 *
 * Wave 2 / B2 replaced the 8 generic `shape` cases ('brain', 'graph', 'stack',
 * 'robot', 'prism', 'cards', 'brackets', 'vault') with 9 district-specific
 * factories — one per district key. Each factory module produces a
 * THREE.Group whose `userData.{monument, sculpt, labelDot}` stamps match the
 * shape the SceneRoot animation loop expects, so this swap is drop-in.
 *
 * NEW: the hidden MINDsense Sanctuary (district key 'mindsense') is rendered
 * the same way — SceneRoot decides visibility based on `district.hidden` +
 * proximity at render time.
 */

import * as THREE from 'three'
import type { District } from './types'
import { buildMemoryAtrium } from './factories/memoryAtrium'
import { buildKnowledgeGraphObservatory } from './factories/knowledgeGraphObservatory'
import { buildModelsBoulevard } from './factories/modelsBoulevard'
import { buildAgentTown } from './factories/agentTown'
import { buildCreativeStudio } from './factories/creativeStudio'
import { buildLifeBoardCity } from './factories/lifeBoardCity'
import { buildDeveloperArcade } from './factories/developerArcade'
import { buildPatentsPavilion } from './factories/patentsPavilion'
import { buildMindsenseSanctuary } from './factories/mindsenseSanctuary'

export function buildMonument(d: District): THREE.Group {
  switch (d.key) {
    case 'memory':
      return buildMemoryAtrium(d)
    case 'graph':
      return buildKnowledgeGraphObservatory(d)
    case 'models':
      return buildModelsBoulevard(d)
    case 'agents':
      return buildAgentTown(d)
    case 'studio':
      return buildCreativeStudio(d)
    case 'life':
      return buildLifeBoardCity(d)
    case 'api':
      return buildDeveloperArcade(d)
    case 'patents':
      return buildPatentsPavilion(d)
    case 'mindsense':
      return buildMindsenseSanctuary(d)
    default: {
      // Exhaustiveness check: TypeScript will flag if a future district key
      // is added without a factory.
      const _exhaustive: never = d.key
      // Runtime fallback so we never crash on unknown keys — return an empty
      // group rather than break the whole scene boot.
      void _exhaustive
      return new THREE.Group()
    }
  }
}
