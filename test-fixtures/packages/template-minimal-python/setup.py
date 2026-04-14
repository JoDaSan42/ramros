from setuptools import setup

package_name = '{{package_name}}'

setup(
    name=package_name,
    version='0.0.0',
    packages=[package_name],
    data_files=[
        ('share/' + package_name, ['package.xml']),
        ('share/ament_index/resource_index/packages',
            ['resource/' + package_name]),
    ],
    install_requires=['setuptools'],
    zip_safe=True,
    author='{{author_name}}',
    author_email='{{author_email}}',
    maintainer='{{author_name}}',
    maintainer_email='{{author_email}}',
    description='{{description}}',
    license='{{license}}',
    tests_require=['pytest'],
    entry_points={
        'console_scripts': [
            '{{node_name}} = {{package_name}}.{{node_name}}:main',
        ],
    },
)
