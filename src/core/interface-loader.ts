/**
 * Recursively resolves message structures: a top-level `ros2 interface show`
 * fetch plus one fetch per unknown non-primitive sub-type, with a session
 * in-memory cache keyed by the qualified type name.
 *
 * Pure module: no vscode import; the exec call is injected.
 */

import {
  InterfaceField,
  InterfaceStructure,
  isPrimitiveType,
  parseInterfaceDefinition
} from './interface-parser';

export type FetchDefinition = (qualifiedType: string) => Promise<string>;

export interface InterfaceLoader {
  loadStructure(typeName: string): Promise<InterfaceStructure>;
}

export function createInterfaceLoader(fetchDefinition: FetchDefinition): InterfaceLoader {
  // Session cache: qualified type → parsed fields (promise-shared in flight).
  const cache = new Map<string, Promise<InterfaceField[]>>();

  async function loadFields(qualifiedType: string): Promise<InterfaceField[]> {
    const cached = cache.get(qualifiedType);
    if (cached) {
      // Copy per call site: resolved trees are mutated (sub-trees attached,
      // unresolved marks) and must not leak between message paths.
      return (await cached).map(field => copyField(field));
    }

    const pending = (async () => {
      const output = await fetchDefinition(qualifiedType);
      return parseInterfaceDefinition(qualifiedType, output).fields;
    })();
    cache.set(qualifiedType, pending);
    try {
      const fields = await pending;
      return fields.map(field => copyField(field));
    } catch (error) {
      // Failures are not cached: a later attempt may succeed (workspace got
      // built, daemon came up).
      cache.delete(qualifiedType);
      throw error;
    }
  }

  async function resolveChildren(field: InterfaceField, ancestors: ReadonlySet<string>): Promise<void> {
    if (field.unresolved || isPrimitiveType(field.type) || field.children) {
      return;
    }
    const qualified = qualifyTypeName(field.type);
    if (ancestors.has(qualified)) {
      return;
    }
    try {
      field.children = await loadFields(qualified);
    } catch {
      // Partial failure: only this sub-tree degrades to raw JSON/YAML input.
      field.unresolved = true;
    }
  }

  async function resolveTree(fields: InterfaceField[], ancestors: ReadonlySet<string>): Promise<void> {
    await Promise.all(fields.map(async field => {
      const nextAncestors = new Set(ancestors);
      nextAncestors.add(qualifyTypeName(field.type));
      await resolveChildren(field, ancestors);
      if (field.children) {
        await resolveTree(field.children, nextAncestors);
      }
    }));
  }

  return {
    async loadStructure(typeName: string): Promise<InterfaceStructure> {
      // Top-level failure propagates: the caller falls back to the raw flow.
      const fields = await loadFields(typeName);
      await resolveTree(fields, new Set([typeName]));
      return { typeName, fields };
    }
  };
}

function copyField(field: InterfaceField): InterfaceField {
  return {
    ...field,
    children: field.children?.map(child => copyField(child))
  };
}

/**
 * Expands a bare type reference (`geometry_msgs/Pose`) from an interface
 * definition into the qualified form (`geometry_msgs/msg/Pose`) understood
 * by `ros2 interface show`.
 */
function qualifyTypeName(type: string): string {
  const parts = type.split('/');
  if (parts.length === 3 && (parts[1] === 'msg' || parts[1] === 'srv' || parts[1] === 'action')) {
    return type;
  }
  if (parts.length === 2) {
    return `${parts[0]}/msg/${parts[1]}`;
  }
  return type;
}
