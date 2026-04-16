#!/usr/bin/env python3
import rclpy
from rclpy.node import Node
from std_msgs.msg import String


class PythonNode(Node):

    def __init__(self):
        super().__init__('python_node')
        
        self.publisher_ = self.create_publisher(String, 'python_topic', 10)
        
        self.subscription = self.create_subscription(
            String,
            'input_topic',
            self.listener_callback,
            10)
        self.subscription
        
        self.declare_parameter('node_name', 'default_python_node')
        self.declare_parameter('loop_rate', 10)
        self.declare_parameter('debug_mode', False)

    def listener_callback(self, msg):
        self.get_logger().info(f'Received: {msg.data}')


def main(args=None):
    rclpy.init(args=args)
    node = PythonNode()
    rclpy.spin(node)
    node.destroy_node()
    rclpy.shutdown()


if __name__ == '__main__':
    main()
