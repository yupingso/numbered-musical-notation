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

### Linux
```
sudo apt-get install texlive
sudo apt-get install texlive-xetex
sudo apt-get install texlive-lang-chinese
```

To install `fdsymbol` package, follow the instructions on
https://ctan.org/tex-archive/fonts/fdsymbol?lang=en, and copy `latex/texmf` to
`~/`.

## Running Examples
* Run `python3 test.py examples/input/ latex` to generate tex files, which will be saved inside latex directory.
* Run `cd latex/` and `xelatex main.tex` to generate main.pdf.

## Converting PDF to images

On Windows, run `magick.exe -density 200 latex/main.pdf main.jpg`.
On Linux, run `convert -density 200 latex/main.pdf main.jpg`.
If you see the following error message:

```
convert: attempt to perform an operation not allowed by the security policy `PDF' @ error/constitute.c/IsCoderAuthorized/408.
convert: no images defined `main.jpg' @ error/convert.c/ConvertImageCommand/3288.
```

please add this line in `/etc/ImageMagick-6/policy.xml`

```xml
<policy domain="module" rights="read|write" pattern="{PS,PDF,XPS}" />
```

and comment out

```xml
<policy domain="coder" rights="none" pattern="PDF" />
```

## Tutorial
[English tutorial](docs/tutorial_English.md) and [Chinese tutorial](docs/tutorial_Chinese.md) are provided here.


