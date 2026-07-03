from launch import LaunchDescription
from launch_ros.actions import Node


def generate_launch_description():
    return LaunchDescription([
        Node(
            package='e2e_1783082027988_standard_pkg',
            executable='std_node',
            name='std_node',
            output='screen',
        )
    ])
