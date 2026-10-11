import { InterfaceFileItem } from '../../treeview/workspace-items';
import { CategoryInterfaceFileItem } from '../../treeview/category-items';
import { InterfaceInfo } from '../../core/package-discovery';

describe('Interface tree item qualified names', () => {
  const makeIface = (overrides: Partial<InterfaceInfo>): InterfaceInfo => ({
    type: 'message',
    name: 'Test',
    path: '/x/msg/Test.msg',
    fields: [],
    packageName: 'my_pkg',
    ...overrides,
  });

  describe('InterfaceFileItem.getQualifiedName', () => {
    it('returns a service qualified name with the srv extension', () => {
      const item = new InterfaceFileItem(
        makeIface({ type: 'service', name: 'Reset', path: '/x/srv/Reset.srv' })
      );
      expect(item.getQualifiedName()).toBe('my_pkg/srv/Reset');
    });

    it('returns a message qualified name with the msg extension', () => {
      const item = new InterfaceFileItem(
        makeIface({ type: 'message', name: 'Pose', path: '/x/msg/Pose.msg' })
      );
      expect(item.getQualifiedName()).toBe('my_pkg/msg/Pose');
    });

    it('returns an action qualified name with the action extension', () => {
      const item = new InterfaceFileItem(
        makeIface({ type: 'action', name: 'Navigate', path: '/x/action/Navigate.action' })
      );
      expect(item.getQualifiedName()).toBe('my_pkg/action/Navigate');
    });
  });

  describe('CategoryInterfaceFileItem.getQualifiedName', () => {
    it('returns a service qualified name with the srv extension', () => {
      const item = new CategoryInterfaceFileItem(
        makeIface({ type: 'service', name: 'Reset', path: '/x/srv/Reset.srv' }),
        'my_pkg'
      );
      expect(item.getQualifiedName()).toBe('my_pkg/srv/Reset');
    });

    it('returns a message qualified name with the msg extension', () => {
      const item = new CategoryInterfaceFileItem(
        makeIface({ type: 'message', name: 'Pose', path: '/x/msg/Pose.msg' }),
        'my_pkg'
      );
      expect(item.getQualifiedName()).toBe('my_pkg/msg/Pose');
    });

    it('returns an action qualified name with the action extension', () => {
      const item = new CategoryInterfaceFileItem(
        makeIface({ type: 'action', name: 'Navigate', path: '/x/action/Navigate.action' }),
        'my_pkg'
      );
      expect(item.getQualifiedName()).toBe('my_pkg/action/Navigate');
    });
  });
});
