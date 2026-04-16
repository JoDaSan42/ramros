cmake_minimum_required(VERSION 3.8)
project(mixed_package_example)

if(CMAKE_COMPILER_IS_GNUCXX OR CMAKE_CXX_COMPILER_ID MATCHES "Clang")
  add_compile_options(-Wall -Wextra -Wpedantic)
endif()

find_package(ament_cmake REQUIRED)
find_package(rclcpp REQUIRED)
find_package(std_msgs REQUIRED)

include_directories(include)

add_executable(cpp_node src/cpp_node.cpp)
ament_target_dependencies(cpp_node rclcpp std_msgs)

install(TARGETS cpp_node DESTINATION lib/${PROJECT_NAME})

install(DIRECTORY scripts/ DESTINATION lib/${PROJECT_NAME}
  FILES_MATCHING PATTERN "*.py"
  PROGRAMS
)

if(BUILD_TESTING)
  find_package(ament_lint_auto REQUIRED)
  ament_lint_auto_find_test_dependencies()
endif()

ament_package()
