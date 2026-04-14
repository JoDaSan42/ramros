cmake_minimum_required(VERSION 3.8)
project({{package_name}})

find_package(ament_cmake REQUIRED)
find_package(rosidl_default_generators REQUIRED)
{{dependencies}}

if(BUILD_TESTING)
  find_package(ament_lint_auto REQUIRED)
  set(ament_cmake_copyright_FOUND TRUE)
  set(ament_cmake_cpplint_FOUND TRUE)
  ament_lint_auto_find_test_dependencies()
endif()

{{rosidl_generate_interfaces}}

ament_export_dependencies(rosidl_default_runtime)

ament_package()
