.PHONY: help setup deps doctor check test race vet fmt fmt-check build run

GO ?= go
PROMPT ?= Pod 是 Running，就一定可以接收流量吗？
export PROMPT

help:
	@printf '%s\n' 'make setup       download dependencies and create ignored .env if absent' 'make doctor      validate model configuration without network calls' 'make check       formatting, vet and local mock integration tests' 'make race        run tests with the race detector' 'make build       build bin/sre-copilot' 'make run         ask one question using .env; override PROMPT=...'

setup: deps
	@if [ ! -e .env ]; then umask 077; cp .env.example .env; fi
	@printf '%s\n' 'Set LLM_BASE_URL, LLM_MODEL and LLM_API_KEY in .env, then run make doctor.'

deps:
	$(GO) mod download

doctor:
	$(GO) run ./cmd/sre-copilot --doctor

fmt:
	gofmt -w cmd internal

fmt-check:
	@test -z "$$(gofmt -l cmd internal)" || { gofmt -l cmd internal; exit 1; }

vet:
	$(GO) vet ./...

test:
	$(GO) test ./...

race:
	$(GO) test -race ./...

check: fmt-check vet test

build:
	@mkdir -p bin
	$(GO) build -trimpath -o bin/sre-copilot ./cmd/sre-copilot

run:
	$(GO) run ./cmd/sre-copilot --prompt "$$PROMPT"
