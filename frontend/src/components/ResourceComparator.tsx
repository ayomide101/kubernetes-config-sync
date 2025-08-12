import React, {useState} from 'react';
import {
    Box,
    Typography,
    Card,
    CardContent,
    CardActions,
    Button,
    Chip,
    Accordion,
    AccordionSummary,
    AccordionDetails,
    Alert,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Tooltip,
    Grid,
    Switch,
    FormControlLabel
} from '@mui/material';
import {
    ExpandMore,
    ArrowForward,
    ArrowBack,
    Visibility,
    CheckCircle,
    Warning,
    Error,
    Info
} from '@mui/icons-material';
import {html} from "diff2html";
import * as diff from 'diff';
import 'diff2html/bundles/css/diff2html.min.css';

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

interface ResourceComparatorProps {
    comparisons: ComparisonResult[];
    onApplyChanges: (
        resourceName: string,
        resourceType: string,
        namespace: string,
        direction: 'main-to-replica' | 'replica-to-main',
        resourceData: any
    ) => void;
    loading: boolean;
}

const ResourceComparator: React.FC<ResourceComparatorProps> = ({
                                                                   comparisons,
                                                                   onApplyChanges,
                                                                   loading
                                                               }) => {
    const [selectedComparison, setSelectedComparison] = useState<ResourceComparison | null>(null);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [showDecodedContent, setShowDecodedContent] = useState(false);
    const [confirmDialog, setConfirmDialog] = useState<{
        open: boolean;
        resource: ResourceComparison | null;
        direction: 'main-to-replica' | 'replica-to-main' | null;
    }>({open: false, resource: null, direction: null});

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'identical':
                return 'success';
            case 'different':
                return 'warning';
            case 'main-only':
                return 'info';
            case 'replica-only':
                return 'error';
            default:
                return 'default';
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'identical':
                return <CheckCircle/>;
            case 'different':
                return <Warning/>;
            case 'main-only':
                return <Info/>;
            case 'replica-only':
                return <Error/>;
            default:
                return <Error />;
        }
    };

    const getStatusLabel = (status: string) => {
        switch (status) {
            case 'identical':
                return 'Identical';
            case 'different':
                return 'Different';
            case 'main-only':
                return 'Main Only';
            case 'replica-only':
                return 'Replica Only';
            default:
                return 'Unknown';
        }
    };

    // Utility function to check if a resource is an opaque secret
    const isOpaqueSecret = (comparison: ResourceComparison): boolean => {
        if (comparison.type !== 'Secret') return false;
        
        // Check if either resource has type "Opaque"
        const mainType = comparison.mainResource?.type;
        const replicaType = comparison.replicaResource?.type;
        
        return mainType === 'Opaque' || replicaType === 'Opaque';
    };

    // Utility function to decode base64 data
    const decodeBase64Data = (data: any): any => {
        if (!data || typeof data !== 'object') return data;
        
        const decoded: any = {};
        for (const [key, value] of Object.entries(data)) {
            if (typeof value === 'string') {
                try {
                    decoded[key] = atob(value);
                } catch (e) {
                    // If decoding fails, keep original value
                    decoded[key] = value;
                }
            } else {
                decoded[key] = value;
            }
        }
        return decoded;
    };

    // Utility function to create diff with optionally decoded data
    const createDecodedDiff = (comparison: ResourceComparison): string | null => {
        if (!comparison.mainResource && !comparison.replicaResource) return null;
        
        let mainData = comparison.mainResource?.data;
        let replicaData = comparison.replicaResource?.data;
        
        if (showDecodedContent && isOpaqueSecret(comparison)) {
            mainData = mainData ? decodeBase64Data(mainData) : mainData;
            replicaData = replicaData ? decodeBase64Data(replicaData) : replicaData;
        }
        
        const mainDataStr = JSON.stringify(mainData || {}, null, 2);
        const replicaDataStr = JSON.stringify(replicaData || {}, null, 2);
        
        if (mainDataStr === replicaDataStr) return null;
        
        // Use the same diff.createPatch method as the backend
        return diff.createPatch(
            comparison.name,
            mainDataStr,
            replicaDataStr,
            'Main Cluster',
            'Replica Cluster'
        );
    };

    const handleViewDiff = (comparison: ResourceComparison) => {
        setSelectedComparison(comparison);
        setShowDecodedContent(false); // Reset toggle when opening new diff
        setDialogOpen(true);
    };

    const handleApplyChanges = (resource: ResourceComparison, direction: 'main-to-replica' | 'replica-to-main') => {
        setConfirmDialog({
            open: true,
            resource,
            direction
        });
    };

    const confirmApplyChanges = () => {
        const {resource, direction} = confirmDialog;
        if (resource && direction) {
            const sourceResource = direction === 'main-to-replica' ? resource.mainResource : resource.replicaResource;
            onApplyChanges(
                resource.name,
                resource.type,
                resource.namespace,
                direction,
                sourceResource
            );
        }
        setConfirmDialog({open: false, resource: null, direction: null});
    };

    const renderDiff = (diffText: string) => {
        if (!diffText) return null;

        const diffHtml = html(diffText, {
            drawFileList: false,
            matching: 'lines',
            outputFormat: 'side-by-side'
        });

        return (
            <div
                dangerouslySetInnerHTML={{__html: diffHtml}}
                style={{fontSize: '12px'}}
            />
        );
    };

    const renderDiffContent = (comparison: ResourceComparison) => {
        if (!comparison) return null;

        // For opaque secrets with decode toggle enabled, create new diff with decoded data
        if (isOpaqueSecret(comparison) && showDecodedContent) {
            const decodedDiff = createDecodedDiff(comparison);
            if (decodedDiff) {
                return renderDiff(decodedDiff);
            }
            return (
                <Alert severity="info">
                    No differences found in decoded content.
                </Alert>
            );
        }

        // Use original diff for non-opaque secrets or when decode toggle is off
        if (comparison.diff) {
            return renderDiff(comparison.diff);
        }

        return (
            <Alert severity="info">
                No differences found.
            </Alert>
        );
    };

    const ResourceCard = ({resource}: { resource: ResourceComparison }) => (
        <Card sx={{mb: 2}}>
            <CardContent>
                <Box sx={{display: 'flex', alignItems: 'center', mb: 2}}>
                    <Typography variant="h6" sx={{flexGrow: 1}}>
                        {resource.name}
                    </Typography>
                    <Chip
                        label={resource.type}
                        size="small"
                        variant="outlined"
                        sx={{mr: 1}}
                    />
                    <Chip
                        label={getStatusLabel(resource.status)}
                        color={getStatusColor(resource.status) as any}
                        size="small"
                        icon={getStatusIcon(resource.status)}
                    />
                </Box>

                <Grid container spacing={2}>
                    <Grid size={{xs: 6}}>
                        <Typography variant="subtitle2" color="text.secondary">
                            Main Cluster
                        </Typography>
                        <Typography variant="body2">
                            {resource.mainExists ? '✓ Exists' : '✗ Not found'}
                        </Typography>
                    </Grid>
                    <Grid size={{xs: 6}}>
                        <Typography variant="subtitle2" color="text.secondary">
                            Replica Cluster
                        </Typography>
                        <Typography variant="body2">
                            {resource.replicaExists ? '✓ Exists' : '✗ Not found'}
                        </Typography>
                    </Grid>
                </Grid>
            </CardContent>

            <CardActions sx={{justifyContent: 'space-between', px: 2, pb: 2}}>
                <Box>
                    {resource.status === 'different' && resource.diff && (
                        <Button
                            size="small"
                            startIcon={<Visibility/>}
                            onClick={() => handleViewDiff(resource)}
                        >
                            View Diff
                        </Button>
                    )}
                </Box>

                <Box sx={{display: 'flex', gap: 1}}>
                    {resource.mainExists && !resource.replicaExists && (
                        <Tooltip title="Copy from main to replica cluster">
                            <Button
                                size="small"
                                variant="outlined"
                                startIcon={<ArrowForward/>}
                                onClick={() => handleApplyChanges(resource, 'main-to-replica')}
                                disabled={loading}
                            >
                                Copy to Replica
                            </Button>
                        </Tooltip>
                    )}

                    {resource.replicaExists && !resource.mainExists && (
                        <Tooltip title="Copy from replica to main cluster">
                            <Button
                                size="small"
                                variant="outlined"
                                startIcon={<ArrowBack/>}
                                onClick={() => handleApplyChanges(resource, 'replica-to-main')}
                                disabled={loading}
                            >
                                Copy to Main
                            </Button>
                        </Tooltip>
                    )}

                    {resource.status === 'different' && (
                        <>
                            <Tooltip title="Apply main cluster version to replica">
                                <Button
                                    size="small"
                                    variant="outlined"
                                    startIcon={<ArrowForward/>}
                                    onClick={() => handleApplyChanges(resource, 'main-to-replica')}
                                    disabled={loading}
                                >
                                    Main → Replica
                                </Button>
                            </Tooltip>
                            <Tooltip title="Apply replica cluster version to main">
                                <Button
                                    size="small"
                                    variant="outlined"
                                    startIcon={<ArrowBack/>}
                                    onClick={() => handleApplyChanges(resource, 'replica-to-main')}
                                    disabled={loading}
                                >
                                    Replica → Main
                                </Button>
                            </Tooltip>
                        </>
                    )}
                </Box>
            </CardActions>
        </Card>
    );

    const totalResources = comparisons.reduce((sum, comp) =>
        sum + comp.secrets.length + comp.configMaps.length, 0
    );

    const statusCounts = comparisons.reduce((counts, comp) => {
        [...comp.secrets, ...comp.configMaps].forEach(resource => {
            counts[resource.status] = (counts[resource.status] || 0) + 1;
        });
        return counts;
    }, {} as Record<string, number>);

    return (
        <Box>
            <Typography variant="h5" gutterBottom>
                Resource Comparison Results
            </Typography>

            {/* Summary Cards */}
            <Grid container spacing={2} sx={{mb: 4}}>
                <Grid size={{xs: 6, sm: 3}}>
                    <Card>
                        <CardContent sx={{textAlign: 'center'}}>
                            <Typography variant="h4" color="primary">
                                {totalResources}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                Total Resources
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid size={{xs: 6, sm: 3}}>
                    <Card>
                        <CardContent sx={{textAlign: 'center'}}>
                            <Typography variant="h4" color="success.main">
                                {statusCounts['identical'] || 0}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                Identical
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid size={{xs: 6, sm: 3}}>
                    <Card>
                        <CardContent sx={{textAlign: 'center'}}>
                            <Typography variant="h4" color="warning.main">
                                {statusCounts['different'] || 0}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                Different
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid size={{xs: 6, sm: 3}}>
                    <Card>
                        <CardContent sx={{textAlign: 'center'}}>
                            <Typography variant="h4" color="error.main">
                                {(statusCounts['main-only'] || 0) + (statusCounts['replica-only'] || 0)}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                Missing
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>

            {/* Resource Comparisons by Namespace */}
            {comparisons.map((comparison) => (
                <Accordion key={comparison.namespace} defaultExpanded>
                    <AccordionSummary expandIcon={<ExpandMore/>}>
                        <Typography variant="h6">
                            Namespace: {comparison.namespace}
                        </Typography>
                        <Box sx={{ml: 'auto', mr: 2, display: 'flex', gap: 1}}>
                            <Chip
                                label={`${comparison.secrets.length} Secrets`}
                                size="small"
                                variant="outlined"
                            />
                            <Chip
                                label={`${comparison.configMaps.length} ConfigMaps`}
                                size="small"
                                variant="outlined"
                            />
                        </Box>
                    </AccordionSummary>
                    <AccordionDetails>
                        {/* Secrets */}
                        {comparison.secrets.length > 0 && (
                            <Box sx={{mb: 3}}>
                                <Typography variant="subtitle1" gutterBottom>
                                    Secrets
                                </Typography>
                                {comparison.secrets.map((secret) => (
                                    <ResourceCard key={`secret-${secret.name}`} resource={secret}/>
                                ))}
                            </Box>
                        )}

                        {/* ConfigMaps */}
                        {comparison.configMaps.length > 0 && (
                            <Box>
                                <Typography variant="subtitle1" gutterBottom>
                                    ConfigMaps
                                </Typography>
                                {comparison.configMaps.map((configMap) => (
                                    <ResourceCard key={`configmap-${configMap.name}`} resource={configMap}/>
                                ))}
                            </Box>
                        )}

                        {comparison.secrets.length === 0 && comparison.configMaps.length === 0 && (
                            <Alert severity="info">
                                No secrets or configmaps found in this namespace.
                            </Alert>
                        )}
                    </AccordionDetails>
                </Accordion>
            ))}

            {/* Diff Viewer Dialog */}
            <Dialog
                open={dialogOpen}
                onClose={() => setDialogOpen(false)}
                maxWidth="xl"
                fullWidth
            >
                <DialogTitle>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <Box>
                            Difference View: {selectedComparison?.name}
                            <Typography variant="subtitle2" color="text.secondary">
                                {selectedComparison?.type} in {selectedComparison?.namespace}
                            </Typography>
                        </Box>
                        {selectedComparison && isOpaqueSecret(selectedComparison) && (
                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={showDecodedContent}
                                        onChange={(e) => setShowDecodedContent(e.target.checked)}
                                        size="small"
                                    />
                                }
                                label={
                                    <Typography variant="body2">
                                        Decode Base64
                                    </Typography>
                                }
                                labelPlacement="start"
                            />
                        )}
                    </Box>
                </DialogTitle>
                <DialogContent>
                    {selectedComparison && renderDiffContent(selectedComparison)}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDialogOpen(false)}>Close</Button>
                </DialogActions>
            </Dialog>

            {/* Confirmation Dialog */}
            <Dialog
                open={confirmDialog.open}
                onClose={() => setConfirmDialog({open: false, resource: null, direction: null})}
            >
                <DialogTitle>Confirm Apply Changes</DialogTitle>
                <DialogContent>
                    <Typography paragraph>
                        Are you sure you want to apply
                        the {confirmDialog.direction === 'main-to-replica' ? 'main cluster' : 'replica cluster'} version
                        of{' '}
                        <strong>{confirmDialog.resource?.name}</strong> to the{' '}
                        {confirmDialog.direction === 'main-to-replica' ? 'replica' : 'main'} cluster?
                    </Typography>
                    <Alert severity="warning">
                        This action will overwrite the existing resource in the target cluster.
                    </Alert>
                </DialogContent>
                <DialogActions>
                    <Button
                        onClick={() => setConfirmDialog({open: false, resource: null, direction: null})}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={confirmApplyChanges}
                        variant="contained"
                        disabled={loading}
                    >
                        {loading ? 'Applying...' : 'Apply Changes'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default ResourceComparator;
