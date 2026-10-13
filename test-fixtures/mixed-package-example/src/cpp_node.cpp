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
    this->declare_parameter("epsilon", 1e-3);
    this->declare_parameter<int>("rate", 5);
    this->declare_parameter("gain", 2.5, rcl_interfaces::msg::ParameterDescriptor());

    // create_service<my_ns::srv::Commented>("/commented_service", std::bind(&CppNode::handle, this, _1, _2));
    auto srv = create_service<my_ns::srv::MyService>(
        "/my_service", std::bind(&CppNode::handle, this, std::placeholders::_1, std::placeholders::_2));
    auto cli = this->create_client<my_ns::srv::OtherService>("/other_service");
    auto act_srv = rclcpp_action::create_server<my_ns::action::MyAction>(
        this, "/my_action", std::bind(&CppNode::goal, this, std::placeholders::_1));
    auto act_cli = rclcpp_action::create_client<my_ns::action::CliAction>(this, "/cli_action");
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
