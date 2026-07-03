from launch import LaunchDescription
from launch_ros.actions import Node


def generate_launch_description():
    return LaunchDescription([
        Node(
            package='e2e_1783081861799_cpp_pkg',
            executable='cpp_node',
            name='cpp_node',
            output='screen',
        )
    ])
