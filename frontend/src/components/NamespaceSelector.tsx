import React, {useState, useEffect} from 'react';
import {
    Box,
    Typography,
    FormControlLabel,
    Checkbox,
    Card,
    Grid,
    CardContent,
    Button,
    Chip,
    Alert,
    FormGroup,
    Divider,
    IconButton,
    Tooltip
} from '@mui/material';
import {
    SelectAll,
    Deselect,
    Info,
    CheckCircle,
} from '@mui/icons-material';

interface NamespaceData {
    mainNamespaces: string[];
    replicaNamespaces: string[];
    commonNamespaces: string[];
}

interface NamespaceSelectorProps {
    namespaceData: NamespaceData;
    onSelectionComplete: (selectedNamespaces: string[]) => void;
    selectedNamespaces: string[];
}

const NamespaceSelector: React.FC<NamespaceSelectorProps> = ({
                                                                 namespaceData,
                                                                 onSelectionComplete,
                                                                 selectedNamespaces: initialSelectedNamespaces
                                                             }) => {
    const [selectedNamespaces, setSelectedNamespaces] = useState<string[]>(initialSelectedNamespaces);

    useEffect(() => {
        setSelectedNamespaces(initialSelectedNamespaces);
    }, [initialSelectedNamespaces]);

    const handleNamespaceToggle = (namespace: string) => {
        setSelectedNamespaces(prev => {
            if (prev.includes(namespace)) {
                return prev.filter(ns => ns !== namespace);
            } else {
                return [...prev, namespace];
            }
        });
    };

    const handleSelectAll = (namespaces: string[]) => {
        setSelectedNamespaces(prev => {
            const newSet = new Set([...prev, ...namespaces]);
            return Array.from(newSet);
        });
    };

    const handleDeselectAll = (namespaces: string[]) => {
        setSelectedNamespaces(prev => {
            return prev.filter(ns => !namespaces.includes(ns));
        });
    };

    const handleProceed = () => {
        onSelectionComplete(selectedNamespaces);
    };

    const getNamespaceStatus = (namespace: string) => {
        const inMain = namespaceData.mainNamespaces.includes(namespace);
        const inReplica = namespaceData.replicaNamespaces.includes(namespace);

        if (inMain && inReplica) return 'both';
        if (inMain) return 'main-only';
        if (inReplica) return 'replica-only';
        return 'none';
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'both':
                return 'success';
            case 'main-only':
                return 'warning';
            case 'replica-only':
                return 'error';
            default:
                return 'default';
        }
    };

    const getStatusLabel = (status: string) => {
        switch (status) {
            case 'both':
                return 'Available in both clusters';
            case 'main-only':
                return 'Main cluster only';
            case 'replica-only':
                return 'Replica cluster only';
            default:
                return 'Not available';
        }
    };

    const allNamespaces = Array.from(new Set([
        ...namespaceData.mainNamespaces,
        ...namespaceData.replicaNamespaces
    ])).sort();

    const NamespaceCard = ({
                               title,
                               namespaces,
                               description,
                               color,
                               showSelectActions = true
                           }: {
        title: string;
        namespaces: string[];
        description: string;
        color: 'primary' | 'success' | 'warning' | 'error';
        showSelectActions?: boolean;
    }) => (
        <Card sx={{height: '100%'}}>
            <CardContent>
                <Box sx={{display: 'flex', alignItems: 'center', mb: 2}}>
                    <Typography variant="h6" sx={{flexGrow: 1}}>
                        {title}
                    </Typography>
                    <Chip
                        label={namespaces.length}
                        color={color}
                        size="small"
                    />
                </Box>

                <Typography variant="body2" color="text.secondary" paragraph>
                    {description}
                </Typography>

                {showSelectActions && namespaces.length > 0 && (
                    <Box sx={{mb: 2, display: 'flex', gap: 1}}>
                        <Tooltip title="Select all">
                            <IconButton
                                size="small"
                                onClick={() => handleSelectAll(namespaces)}
                                color="primary"
                            >
                                <SelectAll/>
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="Deselect all">
                            <IconButton
                                size="small"
                                onClick={() => handleDeselectAll(namespaces)}
                                color="secondary"
                            >
                                <Deselect/>
                            </IconButton>
                        </Tooltip>
                    </Box>
                )}

                <Box sx={{maxHeight: 200, overflow: 'auto'}}>
                    <FormGroup>
                        {namespaces.map((namespace) => {
                            const status = getNamespaceStatus(namespace);
                            return (
                                <FormControlLabel
                                    key={namespace}
                                    control={
                                        <Checkbox
                                            checked={selectedNamespaces.includes(namespace)}
                                            onChange={() => handleNamespaceToggle(namespace)}
                                            size="small"
                                        />
                                    }
                                    label={
                                        <Box sx={{display: 'flex', alignItems: 'center', gap: 1}}>
                                            <Typography variant="body2">
                                                {namespace}
                                            </Typography>
                                            <Chip
                                                label={getStatusLabel(status)}
                                                size="small"
                                                color={getStatusColor(status) as any}
                                                variant="outlined"
                                            />
                                        </Box>
                                    }
                                />
                            );
                        })}
                    </FormGroup>
                </Box>
            </CardContent>
        </Card>
    );

    return (
        <Box>
            <Typography variant="h5" gutterBottom>
                Select Namespaces to Compare
            </Typography>
            <Typography variant="body1" color="text.secondary" paragraph>
                Choose the namespaces where you want to compare secrets and configmaps between your main and replica
                clusters.
            </Typography>

            <Alert severity="info" sx={{mb: 3}}>
                <Box sx={{display: 'flex', alignItems: 'center', gap: 1}}>
                    <Info/>
                    <Typography variant="body2">
                        We recommend starting with common namespaces that exist in both clusters for the most meaningful
                        comparisons.
                    </Typography>
                </Box>
            </Alert>

            <Grid container spacing={3} sx={{mb: 4}}>
                <Grid size={{xs: 12, md: 4}}>
                    <NamespaceCard
                        title="Common Namespaces"
                        namespaces={namespaceData.commonNamespaces}
                        description="Namespaces that exist in both clusters. These are ideal for comparison."
                        color="success"
                    />
                </Grid>

                <Grid size={{xs: 12, md: 4}}>
                    <NamespaceCard
                        title="Main Cluster Only"
                        namespaces={namespaceData.mainNamespaces.filter(ns =>
                            !namespaceData.commonNamespaces.includes(ns)
                        )}
                        description="Namespaces that only exist in the main cluster."
                        color="warning"
                    />
                </Grid>

                <Grid size={{xs: 12, md: 4}}>
                    <NamespaceCard
                        title="Replica Cluster Only"
                        namespaces={namespaceData.replicaNamespaces.filter(ns =>
                            !namespaceData.commonNamespaces.includes(ns)
                        )}
                        description="Namespaces that only exist in the replica cluster."
                        color="error"
                    />
                </Grid>
            </Grid>

            <Divider sx={{my: 3}}/>

            <Card>
                <CardContent>
                    <Typography variant="h6" gutterBottom>
                        All Available Namespaces
                    </Typography>

                    <Box sx={{mb: 3, display: 'flex', gap: 2, alignItems: 'center'}}>
                        <Button
                            variant="outlined"
                            startIcon={<SelectAll/>}
                            onClick={() => handleSelectAll(namespaceData.commonNamespaces)}
                            size="small"
                        >
                            Select Common Only
                        </Button>
                        <Button
                            variant="outlined"
                            startIcon={<SelectAll/>}
                            onClick={() => handleSelectAll(allNamespaces)}
                            size="small"
                        >
                            Select All
                        </Button>
                        <Button
                            variant="outlined"
                            startIcon={<Deselect/>}
                            onClick={() => setSelectedNamespaces([])}
                            size="small"
                            color="secondary"
                        >
                            Clear Selection
                        </Button>

                        <Box sx={{ml: 'auto'}}>
                            <Chip
                                label={`${selectedNamespaces.length} selected`}
                                color={selectedNamespaces.length > 0 ? 'primary' : 'default'}
                                icon={selectedNamespaces.length > 0 ? <CheckCircle/> : undefined}
                            />
                        </Box>
                    </Box>

                    <Grid container spacing={2}>
                        {allNamespaces.map((namespace) => {
                            const status = getNamespaceStatus(namespace);
                            return (
                                <Grid size={{xs: 12, md: 4, sm: 6}} key={namespace}>
                                    <FormControlLabel
                                        control={
                                            <Checkbox
                                                checked={selectedNamespaces.includes(namespace)}
                                                onChange={() => handleNamespaceToggle(namespace)}
                                            />
                                        }
                                        label={
                                            <Box sx={{display: 'flex', alignItems: 'center', gap: 1}}>
                                                <Typography variant="body2">
                                                    {namespace}
                                                </Typography>
                                                <Chip
                                                    label={status === 'both' ? '✓' : status === 'main-only' ? 'M' : 'R'}
                                                    size="small"
                                                    color={getStatusColor(status) as any}
                                                    sx={{minWidth: 'auto', height: 20}}
                                                />
                                            </Box>
                                        }
                                    />
                                </Grid>
                            );
                        })}
                    </Grid>
                </CardContent>
            </Card>

            {selectedNamespaces.length === 0 && (
                <Alert severity="warning" sx={{mt: 3}}>
                    <Typography variant="body2">
                        Please select at least one namespace to proceed with the comparison.
                    </Typography>
                </Alert>
            )}

            <Box sx={{display: 'flex', justifyContent: 'center', gap: 2, mt: 4}}>
                <Button
                    variant="contained"
                    size="large"
                    onClick={handleProceed}
                    disabled={selectedNamespaces.length === 0}
                    startIcon={<CheckCircle/>}
                >
                    Proceed with {selectedNamespaces.length} Namespace{selectedNamespaces.length !== 1 ? 's' : ''}
                </Button>
            </Box>
        </Box>
    );
};

export default NamespaceSelector;
