"""
MACS Airbase — Multi-Agent Command System for Smart Air Bases — Entry point

Usage:
    python main.py                          # mock mode, surge scenario
    python main.py --scenario scramble      # different scenario
    GOOGLE_API_KEY=... python main.py --live # real Gemini SAUs
    python main.py --list-scenarios

Controls (live, type in terminal):
    kill <SAU>        e.g. kill OPS      — simulates SAU failure
    revive <SAU>      e.g. revive OPS    — brings SAU back online
    state             — print bulletin board stats
    world             — print shared world state snapshot
    quit              — stop everything
"""

import argparse
import logging
import os
import ssl

# Fix macOS SSL certificate verification for all threads/HTTP clients.
try:
    import certifi as _certifi_mod
    _SSL_CAFILE = _certifi_mod.where()
    _orig_create_default_context = ssl.create_default_context

    def _ssl_certifi_context(*args, **kwargs):
        if not (kwargs.get("cafile") or kwargs.get("capath") or kwargs.get("cadata")):
            kwargs["cafile"] = _SSL_CAFILE
        return _orig_create_default_context(*args, **kwargs)

    ssl.create_default_context = _ssl_certifi_context
    ssl._create_default_https_context = lambda: _ssl_certifi_context()

    try:
        import httpx as _httpx_mod
        _orig_httpx_client_init = _httpx_mod.Client.__init__
        _orig_httpx_async_init  = _httpx_mod.AsyncClient.__init__

        def _httpx_certifi_init(self, *args, **kwargs):
            if kwargs.get("verify") is None or kwargs.get("verify") is True:
                kwargs["verify"] = _SSL_CAFILE
            _orig_httpx_client_init(self, *args, **kwargs)

        def _httpx_certifi_async_init(self, *args, **kwargs):
            if kwargs.get("verify") is None or kwargs.get("verify") is True:
                kwargs["verify"] = _SSL_CAFILE
            _orig_httpx_async_init(self, *args, **kwargs)

        _httpx_mod.Client.__init__      = _httpx_certifi_init
        _httpx_mod.AsyncClient.__init__ = _httpx_certifi_async_init
    except (ImportError, AttributeError):
        pass
except ImportError:
    pass

import sys
import time
import threading

from shared_state import bulletin
from personas import build_macs
from scenarios import ScenarioRunner
from ws_server import start_ws_server
from world_state import start_world_state

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-7s  %(name)s  %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("main")

GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.0-flash-lite")

SEVERITY_COLOR = {
    "CRITICAL": "\033[91m",  # red
    "HIGH":     "\033[93m",  # yellow
    "AMBER":    "\033[93m",  # yellow
    "MEDIUM":   "\033[96m",  # cyan
    "LOW":      "\033[92m",  # green
    "INFO":     "\033[37m",  # grey
}
RESET = "\033[0m"
BOLD  = "\033[1m"

DOMAIN_ICON = {
    "SORTIE":      "✈️ ",
    "FUEL":        "⛽",
    "ARMING":      "🔫",
    "MAINTENANCE": "🔧",
    "THREAT":      "🎯",
    "SYSTEM":      "🌐",
}


def print_event(event):
    color = SEVERITY_COLOR.get(event.severity, "")
    icon  = DOMAIN_ICON.get(event.domain, "•")
    msg   = event.payload.get("message", "")[:100]
    print(
        f"{color}[{event.id}] {icon} {BOLD}{event.source:<10}{RESET}{color} "
        f"| {event.event_type:<28} | {msg}{RESET}"
    )


def run_cli(agents: dict, runner: ScenarioRunner, world_state_mgr=None):
    """Simple CLI for live demo control."""
    print("\n\033[1mMACS Airbase CLI — commands: kill <SAU> | revive <SAU> | state | world | quit\033[0m\n")
    while True:
        try:
            cmd = input("> ").strip().lower()
        except (EOFError, KeyboardInterrupt):
            break

        parts = cmd.split()
        if not parts:
            continue

        if parts[0] == "quit":
            break
        elif parts[0] == "kill" and len(parts) > 1:
            agent_id = parts[1].upper()
            if agent_id in agents:
                agents[agent_id].stop()
                print(f"\033[91m💀 SAU {agent_id} killed.\033[0m")
            else:
                print(f"Unknown SAU: {agent_id}. Available: {', '.join(agents.keys())}")
        elif parts[0] == "revive" and len(parts) > 1:
            agent_id = parts[1].upper()
            if agent_id in agents:
                agents[agent_id].start()
                print(f"\033[92m✅ SAU {agent_id} back online.\033[0m")
            else:
                print(f"Unknown SAU: {agent_id}. Available: {', '.join(agents.keys())}")
        elif parts[0] == "state":
            stats = bulletin.stats()
            print(f"\n{BOLD}Bulletin Board Stats:{RESET}")
            print(f"  Total events : {stats['total_events']}")
            print(f"  By domain    : {stats['by_domain']}")
            print(f"  By severity  : {stats['by_severity']}")
            alive = [id for id, a in agents.items() if a.is_alive()]
            dead  = [id for id, a in agents.items() if not a.is_alive()]
            print(f"  SAUs online  : {', '.join(alive) or 'none'}")
            print(f"  SAUs offline : {', '.join(dead) or 'none'}\n")
        elif parts[0] == "world":
            if world_state_mgr is None:
                print("World state manager not available.")
            else:
                snap = world_state_mgr.snapshot()
                print(f"\n{BOLD}World State:{RESET}")
                print(f"  Scenario    : {snap.get('scenario')}")
                print(f"  Fuel        : {snap.get('fuel')}")
                print(f"  Sorties     : {snap.get('sorties')}")
                print(f"  Arming      : {snap.get('arming')}")
                print(f"  Maintenance : {snap.get('maintenance')}")
                print(f"  Threat      : {snap.get('threat')}")
                print(f"  Base        : {snap.get('base')}\n")
        else:
            print("Unknown command. Try: kill OPS | revive OPS | state | world | quit")


def main():
    parser = argparse.ArgumentParser(description="MACS Airbase — Multi-Agent Command System for Smart Air Bases")
    parser.add_argument("--scenario", default="surge", help="Scenario key (surge, scramble, disperse)")
    parser.add_argument("--list-scenarios", action="store_true", help="List available scenarios")
    parser.add_argument("--live", action="store_true", help="Use real LLM agents (requires an API key)")
    parser.add_argument("--api-key", default=os.getenv("ANTHROPIC_API_KEY"), help="Anthropic API key")
    parser.add_argument("--google-api-key", default=os.getenv("GOOGLE_API_KEY"), help="Google/Gemini API key")
    parser.add_argument("--openrouter-api-key", default=os.getenv("OPENROUTER_API_KEY"), help="OpenRouter API key")
    parser.add_argument("--tick", type=float, default=5.0, help="Agent tick interval in seconds")
    parser.add_argument("--no-ws", action="store_true", help="Disable WebSocket server")
    args = parser.parse_args()

    if args.list_scenarios:
        for s in ScenarioRunner.list_scenarios():
            print(f"  {s['key']:15} {s['name']}")
            print(f"               {s['description'][:80]}...")
        return

    # Auto-enable live mode if any API key is available
    google_key = args.google_api_key
    anthropic_key = args.api_key
    openrouter_key = args.openrouter_api_key
    if not args.live and (google_key or anthropic_key or openrouter_key):
        args.live = True

    mock_mode = not args.live

    if args.live and not google_key and not anthropic_key and not openrouter_key:
        print("ERROR: --live requires GOOGLE_API_KEY, OPENROUTER_API_KEY, or ANTHROPIC_API_KEY env var")
        sys.exit(1)

    openrouter_model = os.getenv("OPENROUTER_MODEL", "google/gemini-2.5-flash")
    if mock_mode:
        mode_str = "Mock"
    elif google_key:
        mode_str = f"Live ({GEMINI_MODEL})"
    elif openrouter_key:
        mode_str = f"Live (OpenRouter: {openrouter_model})"
    else:
        mode_str = "Live (Claude)"

    print(f"\n{BOLD}{'='*60}")
    print("  MACS Airbase — Multi-Agent Command System for Smart Air Bases")
    print(f"{'='*60}{RESET}")
    print(f"  Mode     : {mode_str}")
    print(f"  Scenario : {args.scenario}")
    print(f"  Tick     : {args.tick}s\n")

    # Subscribe printer to bulletin
    bulletin.subscribe(print_event)

    # Start WebSocket server
    if not args.no_ws:
        start_ws_server()
        print("  Dashboard: ws://localhost:8765")

    # Start world state manager
    world_state_mgr = start_world_state(args.scenario)

    # Periodic flush for debounced world state updates
    def _ws_flush_loop():
        while True:
            time.sleep(5)
            world_state_mgr.flush_pending()

    threading.Thread(target=_ws_flush_loop, daemon=True, name="ws-flush").start()

    print(f"\n{BOLD}Deploying SAUs...{RESET}\n")

    # Build and start SAUs
    swarm = build_macs(mock_mode=mock_mode, api_key=anthropic_key,
                       google_api_key=google_key,
                       openrouter_api_key=openrouter_key,
                       tick_interval=args.tick)
    agent_map = {a.agent_id: a for a in swarm}
    for agent in swarm:
        agent.start()
        time.sleep(0.3)

    # Start scenario
    runner = ScenarioRunner(args.scenario)
    runner.start()

    print(f"\n{BOLD}MACS Airbase active. Scenario '{args.scenario}' running.{RESET}\n")

    try:
        if sys.stdin.isatty():
            run_cli(agent_map, runner, world_state_mgr=world_state_mgr)
        else:
            import signal
            stop_event = threading.Event()
            signal.signal(signal.SIGTERM, lambda *_: stop_event.set())
            signal.signal(signal.SIGINT,  lambda *_: stop_event.set())
            stop_event.wait()
    finally:
        runner.stop()
        for agent in swarm:
            agent.stop()
        print(f"\n{BOLD}MACS Airbase stopped.{RESET}")
        stats = bulletin.stats()
        print(f"Total events on bulletin: {stats['total_events']}")


if __name__ == "__main__":
    main()
