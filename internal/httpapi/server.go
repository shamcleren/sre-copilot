// Package httpapi exposes the same agent loop and approval gate over local HTTP.
package httpapi

import (
	"crypto/subtle"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"strings"

	"github.com/shamcleren/sre-copilot/internal/app"
	"github.com/shamcleren/sre-copilot/internal/changes"
	"github.com/shamcleren/sre-copilot/internal/config"
)

// New returns the local API. When cfg.LocalAPIToken is set, every request must
// send it as a bearer token. The token is never written to the response.
func New(cfg config.Config, logger *slog.Logger) http.Handler {
	if logger == nil {
		logger = slog.New(slog.NewTextHandler(io.Discard, nil))
	}
	mux := http.NewServeMux()
	mux.HandleFunc("POST /v1/runs", func(w http.ResponseWriter, r *http.Request) {
		if !authorize(w, r, cfg.LocalAPIToken) {
			return
		}
		var body struct {
			Prompt string `json:"prompt"`
		}
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&body); err != nil {
			writeError(w, http.StatusBadRequest, "invalid json")
			return
		}
		result, err := app.Run(r.Context(), cfg, body.Prompt, logger)
		if err != nil {
			writeError(w, http.StatusBadGateway, "run failed")
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"run_id": result.RunID, "text": result.Text})
	})
	mux.HandleFunc("GET /v1/alert-plans/{id}", func(w http.ResponseWriter, r *http.Request) {
		if !authorize(w, r, cfg.LocalAPIToken) {
			return
		}
		plan, err := changes.Open(cfg.StateDir).Plan(r.PathValue("id"))
		if err != nil {
			writeError(w, http.StatusNotFound, "plan not found")
			return
		}
		writeJSON(w, http.StatusOK, plan)
	})
	mux.HandleFunc("POST /v1/alert-plans/{id}/approvals", func(w http.ResponseWriter, r *http.Request) {
		if !authorize(w, r, cfg.LocalAPIToken) {
			return
		}
		var body struct {
			ActorID string `json:"actor_id"`
		}
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<16)).Decode(&body); err != nil {
			writeError(w, http.StatusBadRequest, "invalid json")
			return
		}
		approval, err := changes.Open(cfg.StateDir).Approve(r.PathValue("id"), body.ActorID)
		if err != nil {
			status := http.StatusConflict
			if strings.Contains(err.Error(), "not found") {
				status = http.StatusNotFound
			}
			writeError(w, status, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, approval)
	})
	return mux
}

func authorize(w http.ResponseWriter, r *http.Request, token string) bool {
	if token == "" {
		return true
	}
	got := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	if subtle.ConstantTimeCompare([]byte(got), []byte(token)) != 1 {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return false
	}
	return true
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func writeError(w http.ResponseWriter, status int, message string) {
	if message == "" {
		message = http.StatusText(status)
	}
	writeJSON(w, status, map[string]string{"error": message})
}

// ErrListen is returned when a non-loopback server has no local API token.
var ErrListen = errors.New("LOCAL_API_TOKEN is required when the listen address is not loopback")
