#!/bin/bash
# Zero-Downtime PulseBoard Worker Deployment Script
# Usage: ./deploy.sh (run from home directory on the server)

PROJECT_NAME="pulseboard-worker"
SERVICE_NAME="pulseboard-worker.service"
INSTALL_DIR="/home/ubuntu/${PROJECT_NAME}"
STAGING_DIR="/home/ubuntu/${PROJECT_NAME}-staging"
BACKUP_DIR="/home/ubuntu/${PROJECT_NAME}-backup"
TARBALL="/home/ubuntu/pulseboard-cron.tar.gz"
BUN_PATH="/home/ubuntu/.bun/bin/bun"

echo "🚀 Starting Zero-Downtime Deployment..."

# 0. Check tarball exists
if [ ! -f "${TARBALL}" ]; then
    echo "❌ Error: ${TARBALL} not found. Upload it first!"
    exit 1
fi

# 1. Prepare staging directory
echo "📁 Preparing staging directory..."
rm -rf ${STAGING_DIR}
mkdir -p ${STAGING_DIR}
tar -xzf ${TARBALL} -C ${STAGING_DIR}

# 2. Install dependencies in staging
echo "📦 Installing Bun dependencies..."
cd ${STAGING_DIR}
${BUN_PATH} install --production

# 3. Preserve existing .env if it exists
# 3. Handle .env file (Prioritize new uploaded .env)
if [ -f "${STAGING_DIR}/.env" ]; then
    echo "⚠️  Found .env in deployment package. Using it (overwriting existing)..."
    # It's already in staging, so we use it. 
    # Optionally backup the old one on server if you want, but backup happens in step 5 anyway.
elif [ -f "${INSTALL_DIR}/.env" ]; then
    echo "✅ No new .env found. Preserving existing .env from server..."
    cp ${INSTALL_DIR}/.env ${STAGING_DIR}/.env
elif [ -f "${STAGING_DIR}/.env.example" ]; then
    echo "⚠️  No existing .env found. Creating from example."
    echo "   YOU MUST EDIT ${INSTALL_DIR}/.env with your secret keys after deployment!"
    cp ${STAGING_DIR}/.env.example ${STAGING_DIR}/.env
fi

# 4. Update systemd service file (in staging, before swap)
echo "⚙️  Preparing systemd service..."
sed -i "s|{{INSTALL_DIR}}|${INSTALL_DIR}|g" ${STAGING_DIR}/${SERVICE_NAME}

# 5. Atomic Swap (the ~1 second downtime window)
echo "🔄 Performing atomic swap..."
sudo systemctl stop ${SERVICE_NAME} 2>/dev/null || true

# Backup old version
rm -rf ${BACKUP_DIR}
if [ -d "${INSTALL_DIR}" ]; then
    mv ${INSTALL_DIR} ${BACKUP_DIR}
fi

# Swap in new version
mv ${STAGING_DIR} ${INSTALL_DIR}

# 6. Reload and start service
echo "🔁 Starting the PulseBoard Worker..."
sudo cp ${INSTALL_DIR}/${SERVICE_NAME} /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable ${SERVICE_NAME}
sudo systemctl start ${SERVICE_NAME}

# 7. Verify it's running
sleep 2
if sudo systemctl is-active --quiet ${SERVICE_NAME}; then
    echo "✅ Worker is running!"
    echo ""
    echo "🧹 Cleaning up..."
    rm -rf ${BACKUP_DIR}
    rm -f ${TARBALL}
    echo ""
    echo "✨ Deployment complete!"
    echo ""
    echo "📋 Useful commands:"
    echo "   sudo systemctl status ${SERVICE_NAME}  - Check status"
    echo "   sudo journalctl -u ${SERVICE_NAME} -f  - View live logs"
else
    echo "❌ Worker failed to start! Rolling back..."
    sudo systemctl stop ${SERVICE_NAME} 2>/dev/null || true
    rm -rf ${INSTALL_DIR}
    mv ${BACKUP_DIR} ${INSTALL_DIR}
    sudo systemctl start ${SERVICE_NAME}
    echo "🔙 Rolled back to previous version."
    echo "   Check logs: sudo journalctl -u ${SERVICE_NAME} -n 50"
    exit 1
fi