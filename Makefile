INPUT?=examples/input
LATEX_DIR:=latex
IMAGE_DIR:=images

.PHONY: all
all: image

.PHONY: latex
latex:
	src/main.py $(INPUT) latex

.PHONY: pdf
pdf: latex
	cd $(LATEX_DIR) && xelatex main.tex

.PHONY: image
image: pdf
	convert -density 200 $(LATEX_DIR)/main.pdf $(IMAGE_DIR)/main.jpg

.PHONY: lint
lint:
	flake8 src/ tests/

.PHONY: tests
tests:
	pytest
