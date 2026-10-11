import {
  LiveNodeItem,
  NodeServicesItem,
  LiveServiceItem,
  NodeParametersItem,
  LiveParameterItem,
  LiveViewDisabledItem,
  NoEndpointsItem
} from '../../treeview/live-items';
import { Ros2CliService } from '../../core/ros2-cli-service';

describe('Live Items Integration Tests', () => {
  describe('LiveNodeItem with service servers', () => {
    it('exposes a services folder and a parameters folder', async () => {
      const item = new LiveNodeItem('/talker', ['/chatter'], [], [
        { name: '/reset', type: 'std_srvs/srv/Trigger' }
      ]);

      const children = await item.getChildren();

      const services = children.find(c => c instanceof NodeServicesItem);
      expect(services).toBeInstanceOf(NodeServicesItem);

      const serviceChildren = await services!.getChildren();
      const service = serviceChildren.find(c => c instanceof LiveServiceItem) as LiveServiceItem;
      expect(service).toBeInstanceOf(LiveServiceItem);
      expect(service.getServiceName()).toBe('/reset');
      expect(service.getServiceType()).toBe('std_srvs/srv/Trigger');

      expect(children.some(c => c instanceof NodeParametersItem)).toBe(true);
    });

    it('omits the services folder when no service servers are given', async () => {
      const item = new LiveNodeItem('/talker');

      const children = await item.getChildren();

      expect(children.some(c => c instanceof NodeServicesItem)).toBe(false);
      expect(children.some(c => c instanceof NodeParametersItem)).toBe(true);
    });
  });

  describe('NodeParametersItem', () => {
    function makeFakeCli(parameters: string[], value: string | null): Ros2CliService {
      const cli = Ros2CliService.getInstance();
      jest.spyOn(cli, 'getParameterNames').mockResolvedValue(parameters);
      jest.spyOn(cli, 'getParameterValue').mockResolvedValue(value);
      return cli;
    }

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('builds parameter items with values from the CLI', async () => {
      const cli = makeFakeCli(['use_sim_time'], 'False');

      const item = new NodeParametersItem('/talker', cli);
      const children = await item.getChildren();

      expect(children).toHaveLength(1);
      expect(children[0]).toBeInstanceOf(LiveParameterItem);
      expect((children[0] as LiveParameterItem).description).toBe('False');
      expect((children[0] as LiveParameterItem).command?.arguments?.[0]).toBe('/talker');
    });

    it('falls back to NoEndpointsItem when the node has no parameters', async () => {
      const cli = makeFakeCli([], null);

      const item = new NodeParametersItem('/talker', cli);
      const children = await item.getChildren();

      expect(children).toHaveLength(1);
      expect(children[0]).toBeInstanceOf(NoEndpointsItem);
    });
  });

  describe('LiveViewDisabledItem', () => {
    it('shows the enable hint with a toggle command', () => {
      const item = new LiveViewDisabledItem();

      expect(item.label).toBe('Live view disabled — click to enable');
      expect(item.command).toEqual({
        command: 'ramros.live.toggleEnabled',
        title: 'Enable Live View'
      });
    });
  });
});
