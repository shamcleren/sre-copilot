#!/bin/bash
# 在远程部署机（或存在 disk-pressure 的节点）上执行，释放磁盘空间，缓解 node.kubernetes.io/disk-pressure
# 用法：ssh dev 'bash -s' < scripts/deploy/cleanup-disk-remote.sh
# 或：ssh dev 后执行 bash /home/shamcleren/sre-copilot/scripts/deploy/cleanup-disk-remote.sh

set -e

NAMESPACE="${NAMESPACE:-sre-copilot}"

echo "=========================================="
echo "  磁盘使用情况（清理前）"
echo "=========================================="
df -h
echo ""

echo "=========================================="
echo "  Docker 占用"
echo "=========================================="
docker system df 2>/dev/null || true
echo ""

echo "=========================================="
echo "  1. 清理 Docker：未使用镜像、容器、网络、构建缓存"
echo "=========================================="
docker system prune -af
echo ""

echo "=========================================="
echo "  2. 清理 Docker 未使用卷（仅未挂载的 volume）"
echo "=========================================="
docker volume prune -f
echo ""

echo "=========================================="
echo "  3. 清理 K8s 失败/驱逐的 Pod（namespace: $NAMESPACE）"
echo "=========================================="
kubectl delete pods -n $NAMESPACE --field-selector=status.phase=Failed 2>/dev/null || true
kubectl get pods -n $NAMESPACE -o jsonpath='{range .items[?(@.status.reason=="Evicted")]}{.metadata.name}{"\n"}{end}' 2>/dev/null | xargs -r kubectl delete pod -n $NAMESPACE --force --grace-period=0 2>/dev/null || true
echo ""

echo "=========================================="
echo "  4. 清理 K8s 已完成的 Job（若存在）"
echo "=========================================="
kubectl delete jobs -n $NAMESPACE --field-selector=status.successful=1 2>/dev/null || true
echo ""

echo "=========================================="
echo "  磁盘使用情况（清理后）"
echo "=========================================="
df -h
echo ""
docker system df 2>/dev/null || true
echo ""

echo "=========================================="
echo "  5. 解除节点 disk-pressure 污点（便于调度新 Pod）"
echo "=========================================="
for n in $(kubectl get nodes -o jsonpath='{.items[*].metadata.name}' 2>/dev/null); do
  for effect in NoSchedule NoExecute; do
    if kubectl taint nodes "$n" node.kubernetes.io/disk-pressure:${effect}- 2>/dev/null; then
      echo "  已解除 $n 的 node.kubernetes.io/disk-pressure:${effect} 污点"
    fi
  done
done
echo ""

echo "=========================================="
echo "  可选：查看占用较大的目录（需在磁盘紧张的节点上执行）"
echo "=========================================="
echo "  sudo du -sh /var/lib/docker /var/log 2>/dev/null"
echo "  若 /var/log 过大可考虑: sudo find /var/log -type f -name '*.log' -mtime +7 -delete"
echo "=========================================="
