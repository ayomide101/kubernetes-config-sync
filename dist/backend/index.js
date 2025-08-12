"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const multer_1 = __importDefault(require("multer"));
const client_node_1 = require("@kubernetes/client-node");
const diff = __importStar(require("diff"));
const path_1 = __importDefault(require("path"));
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3001;
// Middleware
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.use(express_1.default.static(path_1.default.join(__dirname, '../frontend/build')));
// Multer configuration for file uploads
const storage = multer_1.default.memoryStorage();
const upload = (0, multer_1.default)({ storage });
let mainCluster = null;
let replicaCluster = null;
// Helper function to create Kubernetes client from config content
function createKubernetesClient(configContent, clusterName) {
    const kc = new client_node_1.KubeConfig();
    kc.loadFromString(configContent);
    const api = kc.makeApiClient(client_node_1.CoreV1Api);
    return {
        name: clusterName,
        kubeConfig: kc,
        api
    };
}
// API Routes
// Upload cluster configuration files
app.post('/api/upload-config', upload.fields([
    { name: 'mainConfig', maxCount: 1 },
    { name: 'replicaConfig', maxCount: 1 }
]), (req, res) => {
    try {
        const files = req.files;
        if (files.mainConfig) {
            const mainConfigContent = files.mainConfig[0].buffer.toString('utf8');
            mainCluster = createKubernetesClient(mainConfigContent, 'main');
        }
        if (files.replicaConfig) {
            const replicaConfigContent = files.replicaConfig[0].buffer.toString('utf8');
            replicaCluster = createKubernetesClient(replicaConfigContent, 'replica');
        }
        res.json({
            success: true,
            message: 'Configuration files uploaded successfully',
            mainCluster: !!mainCluster,
            replicaCluster: !!replicaCluster
        });
    }
    catch (error) {
        console.error('Error uploading config:', error);
        res.status(500).json({ success: false, error: 'Failed to upload configuration files' });
    }
});
// Get list of namespaces from both clusters
app.get('/api/namespaces', async (req, res) => {
    try {
        if (!mainCluster || !replicaCluster) {
            return res.status(400).json({ error: 'Both cluster configurations must be uploaded first' });
        }
        const [mainNamespaces, replicaNamespaces] = await Promise.all([
            mainCluster.api.listNamespace(),
            replicaCluster.api.listNamespace()
        ]);
        const mainNsList = mainNamespaces.body.items.map(ns => ns.metadata?.name || '');
        const replicaNsList = replicaNamespaces.body.items.map(ns => ns.metadata?.name || '');
        // Find common namespaces
        const commonNamespaces = mainNsList.filter(ns => replicaNsList.includes(ns));
        res.json({
            mainNamespaces: mainNsList,
            replicaNamespaces: replicaNsList,
            commonNamespaces
        });
    }
    catch (error) {
        console.error('Error fetching namespaces:', error);
        res.status(500).json({ error: 'Failed to fetch namespaces' });
    }
});
// Get secrets and configmaps for specified namespaces
app.post('/api/compare-resources', async (req, res) => {
    try {
        const { namespaces } = req.body;
        if (!mainCluster || !replicaCluster) {
            return res.status(400).json({ error: 'Both cluster configurations must be uploaded first' });
        }
        if (!namespaces || !Array.isArray(namespaces)) {
            return res.status(400).json({ error: 'Namespaces array is required' });
        }
        const comparisons = [];
        for (const namespace of namespaces) {
            // Get secrets
            const [mainSecrets, replicaSecrets] = await Promise.all([
                mainCluster.api.listNamespacedSecret(namespace),
                replicaCluster.api.listNamespacedSecret(namespace)
            ]);
            // Get configmaps
            const [mainConfigMaps, replicaConfigMaps] = await Promise.all([
                mainCluster.api.listNamespacedConfigMap(namespace),
                replicaCluster.api.listNamespacedConfigMap(namespace)
            ]);
            // Process secrets
            const secretComparisons = compareResources(mainSecrets.body.items, replicaSecrets.body.items, 'Secret', namespace);
            // Process configmaps
            const configMapComparisons = compareResources(mainConfigMaps.body.items, replicaConfigMaps.body.items, 'ConfigMap', namespace);
            comparisons.push({
                namespace,
                secrets: secretComparisons,
                configMaps: configMapComparisons
            });
        }
        res.json({ comparisons });
    }
    catch (error) {
        console.error('Error comparing resources:', error);
        res.status(500).json({ error: 'Failed to compare resources' });
    }
});
// Helper function to compare resources
function compareResources(mainResources, replicaResources, resourceType, namespace) {
    const comparisons = [];
    // Create maps for easier lookup
    const mainResourceMap = new Map();
    const replicaResourceMap = new Map();
    mainResources.forEach(resource => {
        mainResourceMap.set(resource.metadata.name, resource);
    });
    replicaResources.forEach(resource => {
        replicaResourceMap.set(resource.metadata.name, resource);
    });
    // Get all unique resource names
    const allResourceNames = new Set([...mainResourceMap.keys(), ...replicaResourceMap.keys()]);
    allResourceNames.forEach(resourceName => {
        const mainResource = mainResourceMap.get(resourceName);
        const replicaResource = replicaResourceMap.get(resourceName);
        let status = 'identical';
        let diffResult = null;
        if (!mainResource && replicaResource) {
            status = 'replica-only';
        }
        else if (mainResource && !replicaResource) {
            status = 'main-only';
        }
        else if (mainResource && replicaResource) {
            // Compare the data/content
            const mainData = resourceType === 'Secret' ? mainResource.data : mainResource.data;
            const replicaData = resourceType === 'Secret' ? replicaResource.data : replicaResource.data;
            const mainDataStr = JSON.stringify(mainData || {}, null, 2);
            const replicaDataStr = JSON.stringify(replicaData || {}, null, 2);
            if (mainDataStr !== replicaDataStr) {
                status = 'different';
                diffResult = diff.createPatch(resourceName, mainDataStr, replicaDataStr, 'Main Cluster', 'Replica Cluster');
            }
        }
        comparisons.push({
            name: resourceName,
            type: resourceType,
            namespace,
            status,
            mainExists: !!mainResource,
            replicaExists: !!replicaResource,
            diff: diffResult,
            mainResource: mainResource || null,
            replicaResource: replicaResource || null
        });
    });
    return comparisons;
}
// Apply changes from main to replica or vice versa
app.post('/api/apply-changes', async (req, res) => {
    try {
        const { resourceName, resourceType, namespace, direction, resourceData } = req.body;
        if (!mainCluster || !replicaCluster) {
            return res.status(400).json({ error: 'Both cluster configurations must be uploaded first' });
        }
        let sourceCluster, targetCluster;
        if (direction === 'main-to-replica') {
            sourceCluster = mainCluster;
            targetCluster = replicaCluster;
        }
        else {
            sourceCluster = replicaCluster;
            targetCluster = mainCluster;
        }
        // Apply the resource to target cluster
        if (resourceType === 'Secret') {
            await targetCluster.api.createNamespacedSecret(namespace, resourceData);
        }
        else if (resourceType === 'ConfigMap') {
            await targetCluster.api.createNamespacedConfigMap(namespace, resourceData);
        }
        res.json({
            success: true,
            message: `${resourceType} '${resourceName}' applied successfully from ${direction}`
        });
    }
    catch (error) {
        console.error('Error applying changes:', error);
        res.status(500).json({ error: 'Failed to apply changes' });
    }
});
// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
// Serve React app for any other routes
app.get('*', (req, res) => {
    res.sendFile(path_1.default.join(__dirname, '../frontend/build/index.html'));
});
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
