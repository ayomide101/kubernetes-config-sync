import React, { useState } from 'react';
import {
  Container,
  Typography,
  Box,
  Stepper,
  Step,
  StepLabel,
  Card,
  CardContent,
  Button,
  Alert,
  CircularProgress,
  ThemeProvider,
  createTheme,
  CssBaseline
} from '@mui/material';
import axios from 'axios';
import ConfigUpload from './components/ConfigUpload';
import NamespaceSelector from './components/NamespaceSelector';
import ResourceComparator from './components/ResourceComparator';
import './App.css';

const theme = createTheme({
  palette: {
    primary: {
      main: '#1976d2',
    },
    secondary: {
      main: '#dc004e',
    },
  },
});

interface NamespaceData {
  mainNamespaces: string[];
  replicaNamespaces: string[];
  commonNamespaces: string[];
}

interface ComparisonResult {
  namespace: string;
  secrets: ResourceComparison[];
  configMaps: ResourceComparison[];
}

interface ResourceComparison {
  name: string;
  type: string;
  namespace: string;
  status: 'identical' | 'different' | 'main-only' | 'replica-only';
  mainExists: boolean;
  replicaExists: boolean;
  diff: string | null;
  mainResource: any;
  replicaResource: any;
}

const steps = ['Upload Cluster Configs', 'Select Namespaces', 'Compare Resources'];

function App() {
  const [activeStep, setActiveStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // State for cluster configurations
  const [clustersConfigured, setClustersConfigured] = useState({
    main: false,
    replica: false
  });
  
  // State for namespaces
  const [namespaceData, setNamespaceData] = useState<NamespaceData | null>(null);
  const [selectedNamespaces, setSelectedNamespaces] = useState<string[]>([]);
  
  // State for comparisons
  const [comparisons, setComparisons] = useState<ComparisonResult[]>([]);

  const handleConfigUpload = async (mainFile: File | null, replicaFile: File | null) => {
    if (!mainFile || !replicaFile) {
      setError('Both main and replica configuration files are required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('mainConfig', mainFile);
      formData.append('replicaConfig', replicaFile);

      const response = await axios.post('/api/upload-config', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      if (response.data.success) {
        setClustersConfigured({
          main: response.data.mainCluster,
          replica: response.data.replicaCluster
        });
        setSuccess('Configuration files uploaded successfully');
        setActiveStep(1);
        
        // Fetch namespaces
        await fetchNamespaces();
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to upload configuration files');
    } finally {
      setLoading(false);
    }
  };

  const fetchNamespaces = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/namespaces');
      setNamespaceData(response.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to fetch namespaces');
    } finally {
      setLoading(false);
    }
  };

  const handleNamespaceSelection = (namespaces: string[]) => {
    setSelectedNamespaces(namespaces);
    setActiveStep(2);
  };

  const handleCompareResources = async () => {
    if (selectedNamespaces.length === 0) {
      setError('Please select at least one namespace');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await axios.post('/api/compare-resources', {
        namespaces: selectedNamespaces
      });

      setComparisons(response.data.comparisons);
      setSuccess(`Successfully compared resources across ${selectedNamespaces.length} namespace(s)`);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to compare resources');
    } finally {
      setLoading(false);
    }
  };

  const handleApplyChanges = async (
    resourceName: string,
    resourceType: string,
    namespace: string,
    direction: 'main-to-replica' | 'replica-to-main',
    resourceData: any
  ) => {
    setLoading(true);
    setError(null);

    try {
      const response = await axios.post('/api/apply-changes', {
        resourceName,
        resourceType,
        namespace,
        direction,
        resourceData
      });

      if (response.data.success) {
        setSuccess(response.data.message);
        // Refresh comparisons
        await handleCompareResources();
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to apply changes');
    } finally {
      setLoading(false);
    }
  };

  const clearMessages = () => {
    setError(null);
    setSuccess(null);
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Container maxWidth="xl">
        <Box sx={{ my: 4 }}>
          <Typography variant="h3" component="h1" gutterBottom align="center">
            Kubernetes Config Comparator
          </Typography>
          <Typography variant="subtitle1" align="center" color="text.secondary" paragraph>
            Compare secrets and configmaps between your main and replica clusters
          </Typography>

          <Box sx={{ width: '100%', mb: 4 }}>
            <Stepper activeStep={activeStep} alternativeLabel>
              {steps.map((label) => (
                <Step key={label}>
                  <StepLabel>{label}</StepLabel>
                </Step>
              ))}
            </Stepper>
          </Box>

          {error && (
            <Alert severity="error" onClose={clearMessages} sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          {success && (
            <Alert severity="success" onClose={clearMessages} sx={{ mb: 2 }}>
              {success}
            </Alert>
          )}

          {loading && (
            <Box display="flex" justifyContent="center" sx={{ mb: 2 }}>
              <CircularProgress />
            </Box>
          )}

          <Card>
            <CardContent>
              {activeStep === 0 && (
                <ConfigUpload
                  onUpload={handleConfigUpload}
                  loading={loading}
                  clustersConfigured={clustersConfigured}
                />
              )}

              {activeStep === 1 && namespaceData && (
                <NamespaceSelector
                  namespaceData={namespaceData}
                  onSelectionComplete={handleNamespaceSelection}
                  selectedNamespaces={selectedNamespaces}
                />
              )}

              {activeStep === 2 && (
                <Box>
                  <Box sx={{ mb: 3, display: 'flex', gap: 2 }}>
                    <Button
                      variant="contained"
                      onClick={handleCompareResources}
                      disabled={loading || selectedNamespaces.length === 0}
                    >
                      Compare Resources
                    </Button>
                    <Button
                      variant="outlined"
                      onClick={() => setActiveStep(1)}
                    >
                      Change Namespaces
                    </Button>
                  </Box>

                  {comparisons.length > 0 && (
                    <ResourceComparator
                      comparisons={comparisons}
                      onApplyChanges={handleApplyChanges}
                      loading={loading}
                    />
                  )}
                </Box>
              )}
            </CardContent>
          </Card>
        </Box>
      </Container>
    </ThemeProvider>
  );
}

export default App;
