INPUT?=examples/input
LATEX_DIR:=latex
IMAGE_DIR:=images

.PHONY: all
all: image

.PHONY: latex
latex:
	src/main.py $(INPUT) $(LATEX_DIR)

.PHONY: pdf
pdf: latex
	cd $(LATEX_DIR) && xelatex main.tex

.PHONY: image
image: pdf
	rm -f $(IMAGE_DIR)/main*.jpg
	convert -density 200 $(LATEX_DIR)/main.pdf "$(IMAGE_DIR)/main-%02d.jpg"

.PHONY: lint
lint:
	flake8 src/ tests/

.PHONY: tests
tests:
	pytest
