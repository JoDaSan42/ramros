import rclpy
from rclpy.node import Node
from std_msgs.msg import String


class E2e1783081861799PyPkgNode(Node):

    def __init__(self):
        super().__init__('py_node')
        self.publisher_ = self.create_publisher(String, 'topic', 10)
        timer_period = 0.5
        self.timer = self.create_timer(timer_period, self.timer_callback)
        self.i = 0

    def timer_callback(self):
        msg = String()
        msg.data = f'Hello from e2e_1783081861799_py_pkg: {self.i}'
        self.publisher_.publish(msg)
        self.get_logger().info(f'Publishing: {msg.data}')
        self.i += 1


def main(args=None):
    rclpy.init(args=args)
    node = E2e1783081861799PyPkgNode()
    rclpy.spin(node)
    node.destroy_node()
    rclpy.shutdown()


if __name__ == '__main__':
    main()
