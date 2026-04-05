#!/usr/bin/env bash
set -euo pipefail

# ─── OVNI AI — AWS Infrastructure Provisioning ──────────────────
#
# This script provisions ALL AWS resources for OVNI AI:
#   - VPC, subnets, internet gateway, route tables
#   - Security groups (EC2, RDS, Redis)
#   - RDS PostgreSQL 16
#   - ElastiCache Redis 7
#   - EC2 instance with Elastic IP
#
# Prerequisites:
#   - AWS CLI configured: `aws configure`
#   - Region set (default: us-east-1)
#
# Usage:
#   1. Edit the CONFIGURATION section below
#   2. Run: ./scripts/aws-provision.sh
#   3. After completion, SSH into EC2 and run the setup commands printed at the end
#
# ─────────────────────────────────────────────────────────────────

# ═══════════════════════════════════════════════════════════════
# CONFIGURATION — Edit these before running
# ═══════════════════════════════════════════════════════════════

REGION="us-east-1"
AZ1="us-east-1a"
AZ2="us-east-1b"

# Your IP for SSH access (get it: curl ifconfig.me)
PEDRO_IP="$(curl -s ifconfig.me)/32"

# RDS password — CHANGE THIS
RDS_PASSWORD="OvniAi2026SecureP@ss"

# SSH key pair name (will be created if doesn't exist)
KEY_NAME="ovni-ai-key"

# EC2 instance type
INSTANCE_TYPE="t3.medium"

# ═══════════════════════════════════════════════════════════════
# DO NOT EDIT BELOW THIS LINE
# ═══════════════════════════════════════════════════════════════

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " OVNI AI — AWS Infrastructure Provisioning"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Region: $REGION"
echo "SSH access from: $PEDRO_IP"
echo ""

# ─── 1. VPC ──────────────────────────────────────────────────
echo "[1/8] Creating VPC..."
VPC_ID=$(aws ec2 create-vpc \
  --cidr-block 10.0.0.0/16 \
  --tag-specifications "ResourceType=vpc,Tags=[{Key=Name,Value=ovni-ai-vpc}]" \
  --region "$REGION" \
  --query "Vpc.VpcId" --output text)
aws ec2 modify-vpc-attribute --vpc-id "$VPC_ID" --enable-dns-support --region "$REGION"
aws ec2 modify-vpc-attribute --vpc-id "$VPC_ID" --enable-dns-hostnames --region "$REGION"
echo "  VPC: $VPC_ID"

# ─── 2. Subnets ─────────────────────────────────────────────
echo "[2/8] Creating subnets..."
PUBLIC_SUBNET=$(aws ec2 create-subnet \
  --vpc-id "$VPC_ID" --cidr-block 10.0.1.0/24 --availability-zone "$AZ1" \
  --tag-specifications "ResourceType=subnet,Tags=[{Key=Name,Value=ovni-ai-public-1a}]" \
  --region "$REGION" --query "Subnet.SubnetId" --output text)
aws ec2 modify-subnet-attribute --subnet-id "$PUBLIC_SUBNET" --map-public-ip-on-launch --region "$REGION"

PRIVATE_SUBNET_1=$(aws ec2 create-subnet \
  --vpc-id "$VPC_ID" --cidr-block 10.0.10.0/24 --availability-zone "$AZ1" \
  --tag-specifications "ResourceType=subnet,Tags=[{Key=Name,Value=ovni-ai-private-1a}]" \
  --region "$REGION" --query "Subnet.SubnetId" --output text)

PRIVATE_SUBNET_2=$(aws ec2 create-subnet \
  --vpc-id "$VPC_ID" --cidr-block 10.0.11.0/24 --availability-zone "$AZ2" \
  --tag-specifications "ResourceType=subnet,Tags=[{Key=Name,Value=ovni-ai-private-1b}]" \
  --region "$REGION" --query "Subnet.SubnetId" --output text)
echo "  Public: $PUBLIC_SUBNET | Private: $PRIVATE_SUBNET_1, $PRIVATE_SUBNET_2"

# ─── 3. Internet Gateway + Route Table ──────────────────────
echo "[3/8] Creating internet gateway..."
IGW_ID=$(aws ec2 create-internet-gateway \
  --tag-specifications "ResourceType=internet-gateway,Tags=[{Key=Name,Value=ovni-ai-igw}]" \
  --region "$REGION" --query "InternetGateway.InternetGatewayId" --output text)
aws ec2 attach-internet-gateway --internet-gateway-id "$IGW_ID" --vpc-id "$VPC_ID" --region "$REGION"

RT_ID=$(aws ec2 create-route-table \
  --vpc-id "$VPC_ID" \
  --tag-specifications "ResourceType=route-table,Tags=[{Key=Name,Value=ovni-ai-public-rt}]" \
  --region "$REGION" --query "RouteTable.RouteTableId" --output text)
aws ec2 create-route --route-table-id "$RT_ID" --destination-cidr-block 0.0.0.0/0 --gateway-id "$IGW_ID" --region "$REGION" > /dev/null
aws ec2 associate-route-table --route-table-id "$RT_ID" --subnet-id "$PUBLIC_SUBNET" --region "$REGION" > /dev/null
echo "  IGW: $IGW_ID | Route table: $RT_ID"

# ─── 4. Security Groups ─────────────────────────────────────
echo "[4/8] Creating security groups..."
EC2_SG=$(aws ec2 create-security-group \
  --group-name ovni-ai-ec2-sg --description "OVNI AI EC2 instance" \
  --vpc-id "$VPC_ID" --region "$REGION" --query "GroupId" --output text)
aws ec2 authorize-security-group-ingress --group-id "$EC2_SG" --protocol tcp --port 22 --cidr "$PEDRO_IP" --region "$REGION" > /dev/null
aws ec2 authorize-security-group-ingress --group-id "$EC2_SG" --protocol tcp --port 80 --cidr 0.0.0.0/0 --region "$REGION" > /dev/null
aws ec2 authorize-security-group-ingress --group-id "$EC2_SG" --protocol tcp --port 443 --cidr 0.0.0.0/0 --region "$REGION" > /dev/null

RDS_SG=$(aws ec2 create-security-group \
  --group-name ovni-ai-rds-sg --description "OVNI AI RDS PostgreSQL" \
  --vpc-id "$VPC_ID" --region "$REGION" --query "GroupId" --output text)
aws ec2 authorize-security-group-ingress --group-id "$RDS_SG" --protocol tcp --port 5432 --source-group "$EC2_SG" --region "$REGION" > /dev/null

REDIS_SG=$(aws ec2 create-security-group \
  --group-name ovni-ai-redis-sg --description "OVNI AI ElastiCache Redis" \
  --vpc-id "$VPC_ID" --region "$REGION" --query "GroupId" --output text)
aws ec2 authorize-security-group-ingress --group-id "$REDIS_SG" --protocol tcp --port 6379 --source-group "$EC2_SG" --region "$REGION" > /dev/null
echo "  EC2 SG: $EC2_SG | RDS SG: $RDS_SG | Redis SG: $REDIS_SG"

# ─── 5. RDS PostgreSQL 16 ───────────────────────────────────
echo "[5/8] Creating RDS PostgreSQL 16 (this takes ~5 min)..."
aws rds create-db-subnet-group \
  --db-subnet-group-name ovni-ai-db-subnet-group \
  --db-subnet-group-description "OVNI AI DB subnets" \
  --subnet-ids "$PRIVATE_SUBNET_1" "$PRIVATE_SUBNET_2" \
  --region "$REGION" > /dev/null

aws rds create-db-instance \
  --db-instance-identifier ovni-ai-postgres \
  --db-instance-class db.t3.micro \
  --engine postgres --engine-version "16" \
  --master-username ovni --master-user-password "$RDS_PASSWORD" \
  --db-name ovni_wrapper \
  --allocated-storage 20 --storage-type gp3 --max-allocated-storage 50 \
  --vpc-security-group-ids "$RDS_SG" \
  --db-subnet-group-name ovni-ai-db-subnet-group \
  --no-publicly-accessible \
  --backup-retention-period 7 \
  --deletion-protection \
  --no-multi-az \
  --region "$REGION" > /dev/null
echo "  RDS creating... (wait for available status)"

# ─── 6. ElastiCache Redis 7 ─────────────────────────────────
echo "[6/8] Creating ElastiCache Redis 7 (this takes ~5 min)..."
aws elasticache create-cache-subnet-group \
  --cache-subnet-group-name ovni-ai-redis-subnet-group \
  --cache-subnet-group-description "OVNI AI Redis subnets" \
  --subnet-ids "$PRIVATE_SUBNET_1" "$PRIVATE_SUBNET_2" \
  --region "$REGION" > /dev/null

aws elasticache create-cache-cluster \
  --cache-cluster-id ovni-ai-redis \
  --engine redis --engine-version "7.1" \
  --cache-node-type cache.t3.micro \
  --num-cache-nodes 1 \
  --cache-subnet-group-name ovni-ai-redis-subnet-group \
  --security-group-ids "$REDIS_SG" \
  --region "$REGION" > /dev/null
echo "  ElastiCache creating... (wait for available status)"

# ─── 7. EC2 Instance ────────────────────────────────────────
echo "[7/8] Launching EC2 instance..."

# Get latest Ubuntu 24.04 AMI
AMI_ID=$(aws ec2 describe-images \
  --owners 099720109477 \
  --filters "Name=name,Values=ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*" "Name=state,Values=available" \
  --query "Images | sort_by(@, &CreationDate) | [-1].ImageId" \
  --region "$REGION" --output text)

# Create key pair if it doesn't exist
aws ec2 describe-key-pairs --key-names "$KEY_NAME" --region "$REGION" > /dev/null 2>&1 || \
  aws ec2 create-key-pair --key-name "$KEY_NAME" --query "KeyMaterial" --output text --region "$REGION" > "${KEY_NAME}.pem" && chmod 400 "${KEY_NAME}.pem" 2>/dev/null || true

INSTANCE_ID=$(aws ec2 run-instances \
  --image-id "$AMI_ID" \
  --instance-type "$INSTANCE_TYPE" \
  --key-name "$KEY_NAME" \
  --subnet-id "$PUBLIC_SUBNET" \
  --security-group-ids "$EC2_SG" \
  --block-device-mappings "DeviceName=/dev/sda1,Ebs={VolumeSize=30,VolumeType=gp3}" \
  --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=ovni-ai-server}]" \
  --region "$REGION" --query "Instances[0].InstanceId" --output text)
echo "  Instance: $INSTANCE_ID (waiting for running state...)"

aws ec2 wait instance-running --instance-ids "$INSTANCE_ID" --region "$REGION"

# ─── 8. Elastic IP ──────────────────────────────────────────
echo "[8/8] Allocating Elastic IP..."
ALLOC_ID=$(aws ec2 allocate-address --domain vpc --region "$REGION" --query "AllocationId" --output text)
ELASTIC_IP=$(aws ec2 describe-addresses --allocation-ids "$ALLOC_ID" --region "$REGION" --query "Addresses[0].PublicIp" --output text)
aws ec2 associate-address --instance-id "$INSTANCE_ID" --allocation-id "$ALLOC_ID" --region "$REGION" > /dev/null

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " AWS Infrastructure Provisioned!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Resources created:"
echo "  VPC:         $VPC_ID"
echo "  EC2:         $INSTANCE_ID"
echo "  Elastic IP:  $ELASTIC_IP"
echo "  RDS:         ovni-ai-postgres (wait ~5 min for 'available')"
echo "  Redis:       ovni-ai-redis (wait ~5 min for 'available')"
echo "  Key pair:    ${KEY_NAME}.pem"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " NEXT STEPS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "1. Wait for RDS and Redis to be available:"
echo "   aws rds wait db-instance-available --db-instance-identifier ovni-ai-postgres --region $REGION"
echo "   aws elasticache wait cache-cluster-available --cache-cluster-id ovni-ai-redis --region $REGION"
echo ""
echo "2. Get RDS endpoint:"
echo "   aws rds describe-db-instances --db-instance-identifier ovni-ai-postgres --query 'DBInstances[0].Endpoint.Address' --output text --region $REGION"
echo ""
echo "3. Get Redis endpoint:"
echo "   aws elasticache describe-cache-clusters --cache-cluster-id ovni-ai-redis --show-cache-node-info --query 'CacheClusters[0].CacheNodes[0].Endpoint.Address' --output text --region $REGION"
echo ""
echo "4. SSH into EC2 and run setup:"
echo "   ssh -i ${KEY_NAME}.pem ubuntu@${ELASTIC_IP}"
echo ""
echo "   Then run:"
echo "   sudo apt update && sudo apt upgrade -y"
echo "   sudo apt install -y docker.io docker-compose-plugin nodejs npm nginx git build-essential postgresql-client redis-tools"
echo "   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs"
echo "   sudo npm install -g pm2"
echo "   sudo systemctl enable docker && sudo systemctl start docker"
echo "   sudo usermod -aG docker ubuntu"
echo "   sudo mkdir -p /opt/ovni-ai /var/lib/ovni-ai/instances"
echo "   sudo chown ubuntu:ubuntu /opt/ovni-ai /var/lib/ovni-ai/instances"
echo "   docker network create ovni-ai-instances"
echo ""
echo "5. Clone repo and deploy:"
echo "   cd /opt/ovni-ai"
echo "   git clone <YOUR_REPO_URL> ."
echo "   # Create .env with production values (see scripts/deploy.sh)"
echo "   ./scripts/deploy.sh"
echo ""
echo "6. Set up SSL:"
echo "   sudo apt install -y certbot python3-certbot-nginx"
echo "   sudo certbot --nginx -d YOUR_DOMAIN"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Save resource IDs for reference
cat > /tmp/ovni-ai-resources.txt << EOF
VPC_ID=$VPC_ID
PUBLIC_SUBNET=$PUBLIC_SUBNET
PRIVATE_SUBNET_1=$PRIVATE_SUBNET_1
PRIVATE_SUBNET_2=$PRIVATE_SUBNET_2
IGW_ID=$IGW_ID
RT_ID=$RT_ID
EC2_SG=$EC2_SG
RDS_SG=$RDS_SG
REDIS_SG=$REDIS_SG
INSTANCE_ID=$INSTANCE_ID
ALLOC_ID=$ALLOC_ID
ELASTIC_IP=$ELASTIC_IP
RDS_PASSWORD=$RDS_PASSWORD
KEY_NAME=$KEY_NAME
EOF
echo "Resource IDs saved to /tmp/ovni-ai-resources.txt"
