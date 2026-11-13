import { createInterfaceLoader } from '../../core/interface-loader';
import { InterfaceField } from '../../core/interface-parser';

/** Flat Pose output (sub-type line without children). */
const POSE_FLAT = 'geometry_msgs/Point position';
const POINT_FLAT = 'float64 x\nfloat64 y\nfloat64 z';
const POSE_INLINE = 'Point position\n\tfloat64 x\n\tfloat64 y\n\tfloat64 z';

describe('interface loader', () => {
  it('loads sub-types recursively and attaches their fields as children', async () => {
    const fetchCalls: string[] = [];
    const loader = createInterfaceLoader(async qualifiedType => {
      fetchCalls.push(qualifiedType);
      return qualifiedType === 'geometry_msgs/msg/Pose' ? POSE_FLAT : POINT_FLAT;
    });

    const structure = await loader.loadStructure('geometry_msgs/msg/Pose');

    expect(fetchCalls).toEqual(['geometry_msgs/msg/Pose', 'geometry_msgs/msg/Point']);
    const position = structure.fields[0];
    expect(position.children?.map(child => child.name)).toEqual(['x', 'y', 'z']);
  });

  it('serves a repeated load of the same type from the session cache', async () => {
    const fetch = jest.fn(async qualifiedType => (qualifiedType === 'geometry_msgs/msg/Pose' ? POSE_FLAT : POINT_FLAT));
    const loader = createInterfaceLoader(fetch);

    await loader.loadStructure('geometry_msgs/msg/Pose');
    await loader.loadStructure('geometry_msgs/msg/Pose');

    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('shares cached sub-type definitions across different top-level types', async () => {
    const fetch = jest.fn(async qualifiedType => {
      if (qualifiedType === 'geometry_msgs/msg/Pose') {
        return POSE_FLAT;
      }
      if (qualifiedType === 'geometry_msgs/msg/PoseStamped') {
        return 'geometry_msgs/Pose pose';
      }
      return POINT_FLAT;
    });
    const loader = createInterfaceLoader(fetch);

    await loader.loadStructure('geometry_msgs/msg/Pose');
    await loader.loadStructure('geometry_msgs/msg/PoseStamped');

    // Pose, Point (once), PoseStamped — Point is shared from the cache.
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('marks a sub-tree unresolved when its sub-type fetch fails and retries later', async () => {
    let pointFails = true;
    const fetch = jest.fn(async qualifiedType => {
      if (qualifiedType === 'geometry_msgs/msg/Point') {
        if (pointFails) {
          throw new Error('not built');
        }
        return POINT_FLAT;
      }
      return POSE_FLAT;
    });
    const loader = createInterfaceLoader(fetch);

    const first = await loader.loadStructure('geometry_msgs/msg/Pose');
    expect(first.fields[0].unresolved).toBe(true);

    pointFails = false;
    const second = await loader.loadStructure('geometry_msgs/msg/Pose');
    expect(second.fields[0].unresolved).toBeUndefined();
    expect(second.fields[0].children?.map(child => child.name)).toEqual(['x', 'y', 'z']);
  });

  it('propagates a top-level fetch failure', async () => {
    const loader = createInterfaceLoader(async () => {
      throw new Error('interface show failed');
    });

    await expect(loader.loadStructure('geometry_msgs/msg/Pose')).rejects.toThrow('interface show failed');
  });

  it('does not fetch sub-types that arrived inline-expanded', async () => {
    const fetch = jest.fn(async () => POSE_INLINE);
    const loader = createInterfaceLoader(fetch);

    const structure = await loader.loadStructure('geometry_msgs/msg/Pose');

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(structure.fields[0].children?.map(child => child.name)).toEqual(['x', 'y', 'z']);
  });
});

describe('interface loader typing', () => {
  it('returns structures matching the parser model', async () => {
    const loader = createInterfaceLoader(async () => 'std_msgs/Header header');
    const structure = await loader.loadStructure('pkg/msg/Demo');
    const field: InterfaceField = structure.fields[0];
    expect(field.type).toBe('std_msgs/Header');
  });
});
