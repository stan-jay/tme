import { Injectable, NotFoundException } from '@nestjs/common';
import type { KnowledgePack } from '@tme/shared';

@Injectable()
export class KnowledgePackRegistry {
  private readonly packs = new Map<string, KnowledgePack>();

  register(pack: KnowledgePack): void {
    const key = this.key(pack.manifest.id, pack.manifest.version);
    if (this.packs.has(key)) throw new Error(`Knowledge pack ${key} is already registered`);
    this.packs.set(key, pack);
  }

  get(id: string, version: string): KnowledgePack {
    const pack = this.packs.get(this.key(id, version));
    if (!pack) throw new NotFoundException(`Knowledge pack ${id}@${version} is not installed`);
    return pack;
  }

  /** Resolves the highest registered version of a pack id, or undefined. */
  tryResolve(id: string): KnowledgePack | undefined {
    const candidates = [...this.packs.values()].filter((pack) => pack.manifest.id === id);
    if (!candidates.length) return undefined;
    return candidates.sort((left, right) =>
      right.manifest.version.localeCompare(left.manifest.version, undefined, { numeric: true }),
    )[0];
  }

  list(): KnowledgePack[] {
    return [...this.packs.values()];
  }

  private key(id: string, version: string): string {
    return `${id}@${version}`;
  }
}
