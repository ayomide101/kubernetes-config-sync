import React, {useState} from 'react';
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
    CssBaseline,
    Paper,
} from '@mui/material';
import axios from 'axios';
import ConfigUpload from './components/ConfigUpload';
import NamespaceSelector from './components/NamespaceSelector';
import ResourceComparator from './components/ResourceComparator';
import './App.css';

const theme = createTheme({
    palette: {
        primary: {
            main: '#326CE5',
            light: '#5B8DF7',
            dark: '#1A4FA8',
            contrastText: '#ffffff',
        },
        secondary: {
            main: '#7c3aed',
        },
        success: {
            main: '#059669',
            light: '#d1fae5',
        },
        warning: {
            main: '#d97706',
            light: '#fef3c7',
        },
        error: {
            main: '#dc2626',
            light: '#fee2e2',
        },
        info: {
            main: '#0284c7',
            light: '#e0f2fe',
        },
        background: {
            default: '#f1f5f9',
            paper: '#ffffff',
        },
        text: {
            primary: '#0f172a',
            secondary: '#64748b',
        },
        divider: 'rgba(0,0,0,0.08)',
    },
    typography: {
        fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        h3: {fontWeight: 800},
        h5: {fontWeight: 700},
        h6: {fontWeight: 600},
        subtitle1: {fontWeight: 500},
        subtitle2: {fontWeight: 600},
    },
    shape: {
        borderRadius: 12,
    },
    components: {
        MuiCard: {
            styleOverrides: {
                root: {
                    borderRadius: 12,
                    border: '1px solid rgba(0,0,0,0.07)',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                },
            },
        },
        MuiButton: {
            styleOverrides: {
                root: {
                    borderRadius: 8,
                    textTransform: 'none',
                    fontWeight: 600,
                    fontSize: '0.875rem',
                },
            },
        },
        MuiChip: {
            styleOverrides: {
                root: {
                    borderRadius: 6,
                    fontWeight: 500,
                    fontSize: '0.75rem',
                },
            },
        },
        MuiAccordion: {
            styleOverrides: {
                root: {
                    borderRadius: '12px !important',
                    border: '1px solid rgba(0,0,0,0.07)',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                    '&:before': {display: 'none'},
                    marginBottom: '8px !important',
                },
            },
        },
        MuiDialog: {
            styleOverrides: {
                paper: {borderRadius: 16},
            },
        },
        MuiAlert: {
            styleOverrides: {
                root: {borderRadius: 10},
            },
        },
        MuiPaper: {
            styleOverrides: {
                root: {backgroundImage: 'none'},
            },
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

    const [clustersConfigured, setClustersConfigured] = useState({
        main: false,
        replica: false,
    });

    const [namespaceData, setNamespaceData] = useState<NamespaceData | null>(null);
    const [selectedNamespaces, setSelectedNamespaces] = useState<string[]>([]);
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
                headers: {'Content-Type': 'multipart/form-data'},
            });

            if (response.data.success) {
                setClustersConfigured({
                    main: response.data.mainCluster,
                    replica: response.data.replicaCluster,
                });
                setSuccess('Configuration files uploaded successfully');
                setActiveStep(1);
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
                namespaces: selectedNamespaces,
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
        resourceData: any,
        originalData: any
    ) => {
        setLoading(true);
        setError(null);

        try {
            const response = await axios.post('/api/apply-changes', {
                resourceName,
                resourceType,
                namespace,
                direction,
                resourceData,
                originalData,
            });

            if (response.data.success) {
                setSuccess(response.data.message);
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
            <CssBaseline/>

            {/* Header */}
            <Box sx={{
                background: 'linear-gradient(135deg, #0f172a 0%, #1e3a8a 55%, #2563eb 100%)',
                py: 2.5,
                px: {xs: 2, md: 4},
            }}>
                <Box sx={{maxWidth: 1536, mx: 'auto', display: 'flex', alignItems: 'center', gap: 2}}>
                    <Box sx={{
                        width: 44,
                        height: 44,
                        borderRadius: '10px',
                        background: 'rgba(255,255,255,0.12)',
                        border: '1px solid rgba(255,255,255,0.22)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                    }}>
                        <Typography sx={{
                            fontSize: 17,
                            fontWeight: 800,
                            color: 'white',
                            fontFamily: '"Inter", monospace',
                            letterSpacing: '-0.5px',
                        }}>
                            K8s
                        </Typography>
                    </Box>
                    <Box>
                        <Typography variant="h6" sx={{color: 'white', fontWeight: 700, lineHeight: 1.25}}>
                            Config Comparator
                        </Typography>
                        <Typography variant="caption" sx={{color: 'rgba(255,255,255,0.6)'}}>
                            Compare secrets and configmaps between Kubernetes clusters
                        </Typography>
                    </Box>
                </Box>
            </Box>

            {/* Page body */}
            <Box sx={{backgroundColor: 'background.default', minHeight: 'calc(100vh - 80px)', py: 4}}>
                <Container maxWidth="xl">

                    {/* Stepper */}
                    <Paper elevation={0} sx={{
                        mb: 3,
                        p: {xs: 2, md: 3},
                        border: '1px solid rgba(0,0,0,0.07)',
                        borderRadius: 3,
                    }}>
                        <Stepper activeStep={activeStep} alternativeLabel>
                            {steps.map((label) => (
                                <Step key={label}>
                                    <StepLabel>{label}</StepLabel>
                                </Step>
                            ))}
                        </Stepper>
                    </Paper>

                    {/* Alerts */}
                    {error && (
                        <Alert severity="error" onClose={clearMessages} sx={{mb: 2}}>
                            {error}
                        </Alert>
                    )}
                    {success && (
                        <Alert severity="success" onClose={clearMessages} sx={{mb: 2}}>
                            {success}
                        </Alert>
                    )}
                    {loading && (
                        <Box display="flex" justifyContent="center" sx={{mb: 2}}>
                            <CircularProgress size={28}/>
                        </Box>
                    )}

                    {/* Step content */}
                    <Card elevation={0}>
                        <CardContent sx={{p: {xs: 2, md: 4}}}>
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
                                    <Box sx={{mb: 3, display: 'flex', gap: 2}}>
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
                </Container>
            </Box>
        </ThemeProvider>
    );
}

export default App;
