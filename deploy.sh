#!/bin/bash
PROJECT_NAME="pulseboard-worker"
SERVICE_NAME="pulseboard-worker.service"
INSTALL_DIR="/home/ubuntu/${PROJECT_NAME}"

# 1. Cleanup old directory and extract new files
echo "🚀 Deploying to ${INSTALL_DIR}..."
rm -rf ${INSTALL_DIR}
mkdir -p ${INSTALL_DIR}
tar -xzf pulseboard-cron.tar.gz -C ${INSTALL_DIR}

# 2. Change into the directory and install dependencies
cd ${INSTALL_DIR}
echo "📦 Installing Bun dependencies..."
/home/ubuntu/.bun/bin/bun install --production

# 3. Create actual .env file if it doesn't exist
if [ ! -f "${INSTALL_DIR}/.env" ]; then
    echo "⚠️ .env file not found. Copying example. YOU MUST EDIT THIS FILE with secret keys."
    cp ${INSTALL_DIR}/.env.example ${INSTALL_DIR}/.env
else
    echo "✅ Existing .env found."
fi

# 4. Install Systemd Service
echo "⚙️ Installing Systemd service..."
sudo cp ${INSTALL_DIR}/${SERVICE_NAME} /etc/systemd/system/
sudo sed -i "s|{{INSTALL_DIR}}|${INSTALL_DIR}|g" /etc/systemd/system/${SERVICE_NAME}
sudo systemctl daemon-reload
sudo systemctl enable ${SERVICE_NAME}

# 5. Restart the Worker
echo "🔁 Restarting the PulseBoard Worker..."
sudo systemctl restart ${SERVICE_NAME}

echo "✨ Deployment complete. Check status with: sudo systemctl status pulseboard-cron"