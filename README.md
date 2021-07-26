# numbered-musical-notation
The main goal of this project is to automatically produce song slides with melody and lyrics as user input.
There are two parts involved in this process:
- Python3 `nmn` module
    - reads *melody* and *lyrics* as text input and stores them as a `Song` object
    - prints `Song` objects in a human readable form
    - saves `Song` objects as LaTeX `tikzpicture` codes (TikZ package)
- LaTeX
    - produces nice-formatted song slides with **numbered musical notation** and lyrics

## Installation
No installation is required for the python module. `import nmn` will do.
To produce song slides with LaTeX, however, XeLaTeX and all packages included in `latex/main.tex` should be installed properly.

## Running Examples
* Run `python3 test.py examples/input/ latex` to generate tex files, which will be saved inside latex directory.
* Run `cd latex/` and `xelatex main.tex` to generate main.pdf.

## Tutorial
[English tutorial](docs/tutorial_English.md) and [Chinese tutorial](docs/tutorial_Chinese.md) are provided here.


