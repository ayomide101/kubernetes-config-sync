import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { KubeConfig, CoreV1Api } from '@kubernetes/client-node';
import * as yaml from 'js-yaml';
import * as diff from 'diff';
import path from 'path';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend/build')));

// Multer configuration for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Store cluster configurations
interface ClusterConfig {
  name: string;
  kubeConfig: KubeConfig;
  api: CoreV1Api;
}

interface ResourceComparison {
  name: string;
  type: string;
  namespace: string;
  status: string;
  mainExists: boolean;
  replicaExists: boolean;
  diff: string | null;
  mainResource: any;
  replicaResource: any;
}

interface NamespaceComparison {
  namespace: string;
  secrets: ResourceComparison[];
  configMaps: ResourceComparison[];
}

let mainCluster: ClusterConfig | null = null;
let replicaCluster: ClusterConfig | null = null;

// Helper function to create Kubernetes client from config content
function createKubernetesClient(configContent: string, clusterName: string): ClusterConfig {
  const kc = new KubeConfig();
  kc.loadFromString(configContent);
  const api = kc.makeApiClient(CoreV1Api);
  
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
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    
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
  } catch (error) {
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
  } catch (error) {
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

    const comparisons: NamespaceComparison[] = [];

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
      const secretComparisons = compareResources(
        mainSecrets.body.items,
        replicaSecrets.body.items,
        'Secret',
        namespace
      );

      // Process configmaps
      const configMapComparisons = compareResources(
        mainConfigMaps.body.items,
        replicaConfigMaps.body.items,
        'ConfigMap',
        namespace
      );

      comparisons.push({
        namespace,
        secrets: secretComparisons,
        configMaps: configMapComparisons
      });
    }

    res.json({ comparisons });
  } catch (error) {
    console.error('Error comparing resources:', error);
    res.status(500).json({ error: 'Failed to compare resources' });
  }
});

// Helper function to compare resources
function compareResources(mainResources: any[], replicaResources: any[], resourceType: string, namespace: string): ResourceComparison[] {
  const comparisons: ResourceComparison[] = [];
  
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
    } else if (mainResource && !replicaResource) {
      status = 'main-only';
    } else if (mainResource && replicaResource) {
      // Compare the data/content
      const mainData = resourceType === 'Secret' ? mainResource.data : mainResource.data;
      const replicaData = resourceType === 'Secret' ? replicaResource.data : replicaResource.data;
      
      const mainDataStr = JSON.stringify(mainData || {}, null, 2);
      const replicaDataStr = JSON.stringify(replicaData || {}, null, 2);
      
      if (mainDataStr !== replicaDataStr) {
        status = 'different';
        diffResult = diff.createPatch(
          resourceName,
          mainDataStr,
          replicaDataStr,
          'Main Cluster',
          'Replica Cluster'
        );
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
    } else {
      sourceCluster = replicaCluster;
      targetCluster = mainCluster;
    }

    // Apply the resource to target cluster
    if (resourceType === 'Secret') {
      await targetCluster.api.createNamespacedSecret(namespace, resourceData);
    } else if (resourceType === 'ConfigMap') {
      await targetCluster.api.createNamespacedConfigMap(namespace, resourceData);
    }

    res.json({ 
      success: true, 
      message: `${resourceType} '${resourceName}' applied successfully from ${direction}` 
    });
  } catch (error) {
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
  res.sendFile(path.join(__dirname, '../frontend/build/index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
