INPUT ?= examples/input
BUILD ?= build

LATEX_DIR := latex
LATEX_BUILD := $(BUILD)/latex
IMAGE_BUILD := $(BUILD)/images

.PHONY: all
all: image

.PHONY: latex
latex:
	mkdir -p $(LATEX_BUILD)
	cp -r $(LATEX_DIR) $(LATEX_BUILD)
	src/main.py $(INPUT) $(LATEX_BUILD)

.PHONY: pdf
pdf: latex
	cd $(LATEX_BUILD) && xelatex main.tex

.PHONY: image
image: pdf
	mkdir -p $(IMAGE_BUILD)
	rm -f $(IMAGE_BUILD)/main*.jpg
	convert -density 200 $(LATEX_BUILD)/main.pdf \
		"$(IMAGE_BUILD)/main-%02d.jpg"

.PHONY: lint
lint:
	flake8 src/ tests/

.PHONY: tests
tests:
	pytest
