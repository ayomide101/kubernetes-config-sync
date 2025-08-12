import React, {useState, useRef} from 'react';
import {
    Box,
    Typography,
    Button,
    Grid,
    Card,
    CardContent,
    CardActions,
    Chip,
    Alert,
    LinearProgress
} from '@mui/material';
import {
    CloudUpload,
    CheckCircle,
    Description
} from '@mui/icons-material';

interface ConfigUploadProps {
    onUpload: (mainFile: File | null, replicaFile: File | null) => void;
    loading: boolean;
    clustersConfigured: {
        main: boolean;
        replica: boolean;
    };
}

const ConfigUpload: React.FC<ConfigUploadProps> = ({
                                                       onUpload,
                                                       loading,
                                                       clustersConfigured
                                                   }) => {
    const [mainFile, setMainFile] = useState<File | null>(null);
    const [replicaFile, setReplicaFile] = useState<File | null>(null);
    const [dragOver, setDragOver] = useState<'main' | 'replica' | null>(null);

    const mainFileInputRef = useRef<any>(null);
    const replicaFileInputRef = useRef<any>(null);

    const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>, type: 'main' | 'replica') => {
        const file = event.target.files?.[0] || null;
        if (type === 'main') {
            setMainFile(file);
        } else {
            setReplicaFile(file);
        }
    };

    const handleDragOver = (event: React.DragEvent, type: 'main' | 'replica') => {
        event.preventDefault();
        setDragOver(type);
    };

    const handleDragLeave = () => {
        setDragOver(null);
    };

    const handleDrop = (event: React.DragEvent, type: 'main' | 'replica') => {
        event.preventDefault();
        setDragOver(null);

        const file = event.dataTransfer.files[0];
        if (file) {
            if (type === 'main') {
                setMainFile(file);
            } else {
                setReplicaFile(file);
            }
        }
    };

    const handleUpload = () => {
        onUpload(mainFile, replicaFile);
    };

    const FileUploadCard = ({
                                type,
                                file,
                                onFileSelect,
                                inputRef,
                                configured
                            }: {
        type: 'main' | 'replica';
        file: File | null;
        onFileSelect: (event: React.ChangeEvent<HTMLInputElement>) => void;
        inputRef: React.RefObject<HTMLInputElement>;
        configured: boolean;
    }) => (
        <Card
            sx={{
                height: '100%',
                border: dragOver === type ? '2px dashed #1976d2' : '1px solid #e0e0e0',
                backgroundColor: dragOver === type ? '#f5f5f5' : 'white',
                transition: 'all 0.3s ease'
            }}
            onDragOver={(e) => handleDragOver(e, type)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, type)}
        >
            <CardContent sx={{textAlign: 'center', py: 4}}>
                <Typography variant="h6" gutterBottom textTransform="capitalize">
                    {type} Cluster Configuration
                </Typography>

                <Box sx={{mb: 3}}>
                    {configured ? (
                        <CheckCircle sx={{fontSize: 60, color: 'success.main'}}/>
                    ) : file ? (
                        <Description sx={{fontSize: 60, color: 'primary.main'}}/>
                    ) : (
                        <CloudUpload sx={{fontSize: 60, color: 'action.disabled'}}/>
                    )}
                </Box>

                {file && (
                    <Box sx={{mb: 2}}>
                        <Chip
                            label={file.name}
                            variant="outlined"
                            color="primary"
                            size="small"
                        />
                        <Typography variant="caption" display="block" sx={{mt: 1}}>
                            Size: {(file.size / 1024).toFixed(1)} KB
                        </Typography>
                    </Box>
                )}

                {configured && (
                    <Chip
                        label="Configuration Loaded"
                        color="success"
                        size="small"
                        icon={<CheckCircle/>}
                    />
                )}

                <Typography variant="body2" color="text.secondary" sx={{mt: 2}}>
                    Drop your kubeconfig file here or click to browse
                </Typography>
            </CardContent>

            <CardActions sx={{justifyContent: 'center', pb: 3}}>
                <input
                    ref={inputRef}
                    type="file"
                    accept=".yaml,.yml,.json,.conf"
                    style={{display: 'none'}}
                    onChange={onFileSelect}
                />
                <Button
                    variant={file ? "outlined" : "contained"}
                    onClick={() => inputRef.current?.click()}
                    startIcon={<CloudUpload/>}
                    disabled={loading}
                >
                    {file ? 'Change File' : 'Select File'}
                </Button>
            </CardActions>
        </Card>
    );

    return (
        <Box>
            <Typography variant="h5" gutterBottom>
                Upload Cluster Configuration Files
            </Typography>
            <Typography variant="body1" color="text.secondary" paragraph>
                Upload the kubeconfig files for both your main and replica clusters.
                These files will be used to connect to your clusters and retrieve secrets and configmaps.
            </Typography>

            <Alert severity="info" sx={{mb: 3}}>
                <Typography variant="body2">
                    <strong>Supported formats:</strong> YAML (.yaml, .yml), Conf (.conf) and JSON (.json) kubeconfig files
                </Typography>
            </Alert>

            {loading && (
                <Box sx={{mb: 3}}>
                    <Typography variant="body2" gutterBottom>
                        Uploading and validating configuration files...
                    </Typography>
                    <LinearProgress/>
                </Box>
            )}

            <Grid container spacing={3} sx={{mb: 4}}>
                <Grid size={{xs: 12, md: 6}}>
                    <FileUploadCard
                        type="main"
                        file={mainFile}
                        onFileSelect={(e) => handleFileSelect(e, 'main')}
                        inputRef={mainFileInputRef}
                        configured={clustersConfigured.main}
                    />
                </Grid>
                <Grid size={{xs: 12, md: 6}}>
                    <FileUploadCard
                        type="replica"
                        file={replicaFile}
                        onFileSelect={(e) => handleFileSelect(e, 'replica')}
                        inputRef={replicaFileInputRef}
                        configured={clustersConfigured.replica}
                    />
                </Grid>
            </Grid>

            <Box sx={{display: 'flex', justifyContent: 'center', gap: 2}}>
                <Button
                    variant="contained"
                    size="large"
                    onClick={handleUpload}
                    disabled={!mainFile || !replicaFile || loading}
                    startIcon={<CloudUpload/>}
                >
                    {loading ? 'Uploading...' : 'Upload Configurations'}
                </Button>

                {(mainFile || replicaFile) && (
                    <Button
                        variant="outlined"
                        size="large"
                        onClick={() => {
                            setMainFile(null);
                            setReplicaFile(null);
                            if (mainFileInputRef.current) mainFileInputRef.current.value = '';
                            if (replicaFileInputRef.current) replicaFileInputRef.current.value = '';
                        }}
                        disabled={loading}
                    >
                        Clear Files
                    </Button>
                )}
            </Box>

            {(clustersConfigured.main || clustersConfigured.replica) && (
                <Alert severity="success" sx={{mt: 3}}>
                    Configuration files uploaded successfully! You can now proceed to select namespaces.
                </Alert>
            )}
        </Box>
    );
};

export default ConfigUpload;

