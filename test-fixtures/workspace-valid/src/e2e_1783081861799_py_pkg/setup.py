from setuptools import find_packages, setup

package_name = 'e2e_1783081861799_py_pkg'

setup(
    name=package_name,
    version='0.0.0',
    packages=find_packages(exclude=['test']),
    data_files=[
        ('share/ament_index/resource_index/packages',
            ['resource/' + package_name]),
        ('share/' + package_name, ['package.xml']),
    ],
    install_requires=['setuptools'],
    zip_safe=True,
    maintainer='E2E Test',
    maintainer_email='e2e@test.com',
    description='E2E test Python package',
    license='MIT',
    extras_require={
        'test': [
            'pytest',
        ],
    },
    entry_points={
        'console_scripts': [
            'py_node = e2e_1783081861799_py_pkg.py_node:main'
        ],
    },
)
