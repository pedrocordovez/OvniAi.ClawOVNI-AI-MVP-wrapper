module.exports = {
  apps: [
    {
      name: "ovni-ai",
      script: "dist/server.js",
      cwd: "/opt/ovni-ai",
      env_file: "/opt/ovni-ai/.env",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      error_file: "/opt/ovni-ai/logs/error.log",
      out_file: "/opt/ovni-ai/logs/out.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
    },
  ],
};
