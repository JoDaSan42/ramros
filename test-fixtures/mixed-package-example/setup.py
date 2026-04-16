from setuptools import setup

package_name = 'mixed_package_example'

setup(
    name=package_name,
    version='2.0.0',
    packages=[package_name],
    data_files=[
        ('share/' + package_name, ['package.xml']),
        ('share/ament_index/resource_index/packages',
            ['resource/' + package_name]),
    ],
    install_requires=['setuptools'],
    zip_safe=True,
    author='Test Maintainer',
    author_email='test@ramros.dev',
    maintainer='Test Maintainer',
    maintainer_email='test@ramros.dev',
    description='Mixed package example for testing - contains both C++ and Python nodes',
    license='MIT',
    tests_require=['pytest'],
    entry_points={
        'console_scripts': [
            'python_node = mixed_package_example.python_node:main',
        ],
    },
)
