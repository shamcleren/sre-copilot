// Package config reads private local settings without changing process state.
package config

import (
	"errors"
	"fmt"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

type Config struct {
	BaseURL     string
	Model       string
	APIKey      string
	Timeout     time.Duration
	MaxLLMCalls int
	SkillsRoot  string
	BKCLIPath   string
}

// Load treats .env as data, never as a shell script. Exported variables take
// precedence, including an explicitly exported empty value.
func Load(path string, lookup func(string) (string, bool)) (Config, error) {
	values := map[string]string{}
	if path != "" {
		var err error
		values, err = godotenv.Read(path)
		if err != nil && !errors.Is(err, os.ErrNotExist) {
			return Config{}, errors.New("cannot read or parse env file")
		}
	}
	get := func(key, fallback string) string {
		if value, ok := lookup(key); ok {
			return strings.TrimSpace(value)
		}
		if value, ok := values[key]; ok {
			return strings.TrimSpace(value)
		}
		return fallback
	}
	cfg := Config{
		BaseURL: get("LLM_BASE_URL", ""),
		Model:   get("LLM_MODEL", ""),
		APIKey:  get("LLM_API_KEY", ""),
	}
	for _, field := range []struct{ name, value string }{
		{"LLM_BASE_URL", cfg.BaseURL}, {"LLM_MODEL", cfg.Model}, {"LLM_API_KEY", cfg.APIKey},
	} {
		if field.value == "" {
			return Config{}, fmt.Errorf("%s is required", field.name)
		}
	}
	u, err := url.Parse(cfg.BaseURL)
	if err != nil || u.Hostname() == "" || (u.Scheme != "https" && u.Scheme != "http") ||
		u.User != nil || u.RawQuery != "" || u.Fragment != "" {
		return Config{}, errors.New("LLM_BASE_URL must be an HTTP(S) API URL without credentials, query or fragment")
	}
	cfg.Timeout, err = time.ParseDuration(get("REQUEST_TIMEOUT", "30s"))
	if err != nil || cfg.Timeout <= 0 {
		return Config{}, errors.New("REQUEST_TIMEOUT must be a positive duration")
	}
	cfg.MaxLLMCalls, err = strconv.Atoi(get("MAX_LLM_CALLS", "8"))
	if err != nil || cfg.MaxLLMCalls <= 0 {
		return Config{}, errors.New("MAX_LLM_CALLS must be a positive integer")
	}
	cfg.SkillsRoot = get("SKILLS_ROOT", "")
	if cfg.SkillsRoot != "" {
		info, statErr := os.Stat(cfg.SkillsRoot)
		if statErr != nil || !info.IsDir() {
			return Config{}, errors.New("SKILLS_ROOT must be an existing directory")
		}
	}
	cfg.BKCLIPath = get("BK_CLI_PATH", "")
	if cfg.BKCLIPath != "" {
		info, statErr := os.Stat(cfg.BKCLIPath)
		if statErr != nil || info.IsDir() {
			return Config{}, errors.New("BK_CLI_PATH must be an existing bk-cli binary")
		}
	}
	return cfg, nil
}
