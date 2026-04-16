#include "rclcpp/rclcpp.hpp"
#include "std_msgs/msg/string.hpp"

class CppNode : public rclcpp::Node
{
public:
  CppNode()
  : Node("cpp_node")
  {
    publisher_ = this->create_publisher<std_msgs::msg::String>("cpp_topic", 10);
    
    auto qos = rclcpp::QoS(rclcpp::KeepLast(10));
    subscription_ = this->create_subscription<std_msgs::msg::String>(
      "input_topic", qos,
      [this](const std_msgs::msg::String::SharedPtr msg) {
        RCLCPP_INFO(this->get_logger(), "Received: %s", msg->data.c_str());
      });
    
    this->declare_parameter("max_retries", 3);
    this->declare_parameter("timeout", 5.0);
    this->declare_parameter("enabled", true);
  }

private:
  rclcpp::Publisher<std_msgs::msg::String>::SharedPtr publisher_;
  rclcpp::Subscription<std_msgs::msg::String>::SharedPtr subscription_;
};

int main(int argc, char * argv[])
{
  rclcpp::init(argc, argv);
  rclcpp::spin(std::make_shared<CppNode>());
  rclcpp::shutdown();
  return 0;
}
