cmake_minimum_required(VERSION 3.8)
project(e2e_1783081861799_service_pkg)

find_package(ament_cmake REQUIRED)
find_package(rosidl_default_generators REQUIRED)
# No additional dependencies

if(BUILD_TESTING)
  find_package(ament_lint_auto REQUIRED)
  set(ament_cmake_copyright_FOUND TRUE)
  set(ament_cmake_cpplint_FOUND TRUE)
  ament_lint_auto_find_test_dependencies()
endif()

rosidl_generate_interfaces(${PROJECT_NAME}
  "srv/ComputeSum.srv"
  
)

ament_export_dependencies(rosidl_default_runtime)

ament_package()
