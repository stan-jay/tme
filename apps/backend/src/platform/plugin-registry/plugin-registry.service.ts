import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  BusinessSystemPlugin,
  DestinationWriter,
  PluginCapability,
  SourceReader,
} from '@tme/connector-sdk';

@Injectable()
export class PluginRegistryService {
  private readonly plugins = new Map<string, BusinessSystemPlugin>();

  register(plugin: BusinessSystemPlugin): void {
    if (this.plugins.has(plugin.manifest.id)) {
      throw new Error(`Plugin ${plugin.manifest.id} is already registered`);
    }
    this.assertCapability('read', plugin.reader, plugin);
    this.assertCapability('write', plugin.writer, plugin);
    this.assertCapability('map', plugin.mapper, plugin);
    this.assertCapability('validate', plugin.validator, plugin);
    this.assertCapability('watch', plugin.watcher, plugin);
    this.assertCapability('rollback', plugin.rollback, plugin);
    this.plugins.set(plugin.manifest.id, plugin);
  }

  list(): BusinessSystemPlugin[] {
    return [...this.plugins.values()];
  }

  get(pluginId: string): BusinessSystemPlugin {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) throw new NotFoundException(`Business-system plugin ${pluginId} is not installed`);
    return plugin;
  }

  writer(pluginId: string): DestinationWriter {
    const plugin = this.get(pluginId);
    if (!plugin.writer) {
      throw new NotFoundException(`Plugin ${pluginId} does not provide a writer capability`);
    }
    return plugin.writer;
  }

  reader(pluginId: string): SourceReader {
    const plugin = this.get(pluginId);
    if (!plugin.reader) {
      throw new NotFoundException(`Plugin ${pluginId} does not provide a reader capability`);
    }
    return plugin.reader;
  }

  private assertCapability(
    capability: PluginCapability,
    implementation: unknown,
    plugin: BusinessSystemPlugin,
  ): void {
    if (plugin.manifest.capabilities.includes(capability) && !implementation) {
      throw new Error(
        `Plugin ${plugin.manifest.id} declares ${capability} without implementing the capability`,
      );
    }
  }
}
