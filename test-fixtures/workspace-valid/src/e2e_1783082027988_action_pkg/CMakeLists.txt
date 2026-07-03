cmake_minimum_required(VERSION 3.8)
project(e2e_1783082027988_action_pkg)

find_package(ament_cmake REQUIRED)
find_package(rosidl_default_generators REQUIRED)
find_package(action_msgs REQUIRED)

if(BUILD_TESTING)
  find_package(ament_lint_auto REQUIRED)
  set(ament_cmake_copyright_FOUND TRUE)
  set(ament_cmake_cpplint_FOUND TRUE)
  ament_lint_auto_find_test_dependencies()
endif()

rosidl_generate_interfaces(${PROJECT_NAME}
  "action/NavigateToPose.action"
  DEPENDENCIES action_msgs
)

ament_export_dependencies(rosidl_default_runtime)

ament_package()
