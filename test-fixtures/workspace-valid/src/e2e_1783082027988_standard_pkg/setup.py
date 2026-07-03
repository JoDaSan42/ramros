from setuptools import setup

package_name = 'e2e_1783082027988_standard_pkg'

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
    author='E2E Test',
    author_email='e2e@test.com',
    maintainer='E2E Test',
    maintainer_email='e2e@test.com',
    description='E2E test standard package',
    license='Apache-2.0',
    tests_require=['pytest'],
    entry_points={
        'console_scripts': [
            'std_node = {package_name}.{nodeName}:main',
        ],
    },
)
