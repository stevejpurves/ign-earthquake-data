import setuptools

setuptools.setup(
    name="igndata",
    version="0.0.1",
    description="IGN volcano data collecton",
    packages=setuptools.find_packages(),
    python_requires='>=3.7',
    install_requires=[
        "requests",
        "typer",
        "pandas",
    ],
)