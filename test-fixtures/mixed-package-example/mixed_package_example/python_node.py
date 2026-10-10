import rclpy
from rclpy.node import Node
from std_msgs.msg import String


class PythonNode(Node):

    def __init__(self):
        super().__init__('python_node')
        self.publisher_ = self.create_publisher(String, 'topic', 10)
        timer_period = 0.5
        self.timer = self.create_timer(timer_period, self.timer_callback)
        self.i = 0
        self.srv = self.create_service(MySrv, '/py_service', self.srv_callback)
        self.cli = self.create_client(OtherSrv, '/py_other_service')
        self.act_srv = ActionServer(self, MyAction, '/py_action', self.execute_cb)
        self.act_cli = ActionClient(self, CliAction, '/py_cli_action')
        # self.act_cli2 = ActionClient(self, CliAction, '/py_commented_action')
        # self.srv2 = self.create_service(MySrv, '/py_commented_service', self.srv_callback)

    def srv_callback(self, request, response):
        return response

    def execute_cb(self, goal_handle):
        return goal_handle

    def timer_callback(self):
        msg = String()
        msg.data = f'Hello from mixed_package_example: {self.i}'
        self.publisher_.publish(msg)
        self.get_logger().info(f'Publishing: {msg.data}')
        self.i += 1


def main(args=None):
    rclpy.init(args=args)
    node = PythonNode()
    rclpy.spin(node)
    node.destroy_node()
    rclpy.shutdown()


if __name__ == '__main__':
    main()
