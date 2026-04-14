#include "rclcpp/rclcpp.hpp"
#include "std_msgs/msg/string.hpp"

class {{ClassName}}Node : public rclcpp::Node
{
public:
  {{ClassName}}Node()
  : Node("{{node_name}}")
  {
    publisher_ = this->create_publisher<std_msgs::msg::String>("topic", 10);
    timer_ = this->create_wall_timer(
      std::chrono::milliseconds(500),
      [this]() { this->timer_callback(); });
  }

private:
  void timer_callback()
  {
    auto message = std_msgs::msg::String();
    message.data = "Hello from {{package_name}}";
    publisher_->publish(message);
  }

  rclcpp::TimerBase::SharedPtr timer_;
  rclcpp::Publisher<std_msgs::msg::String>::SharedPtr publisher_;
};

int main(int argc, char * argv[])
{
  rclcpp::init(argc, argv);
  rclcpp::spin(std::make_shared<{{ClassName}}Node>());
  rclcpp::shutdown();
  return 0;
}
