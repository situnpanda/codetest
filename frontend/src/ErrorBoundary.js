import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, errorMessage: error.message };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Error caught by ErrorBoundary: ", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.state.errorMessage.includes('403')) {
        return (
          <div style={{
            border: '1px solid #f5c6cb',
            backgroundColor: '#f8d7da',
            color: '#721c24',
            padding: '20px',
            borderRadius: '10px',
            margin: '20px',
            textAlign: 'center',
            boxShadow: '0 4px 8px rgba(0, 0, 0, 0.1)'
          }}>
            <h2></h2>
            <p>You're not connected to the VPN. Please connect to global protect and try again, if the issue persists, please reach out to the itelemetry team </p>
          </div>
        );
      }
      return (
        <div style={{
          border: '1px solid #f5c6cb',
          backgroundColor: '#f8d7da',
          color: '#721c24',
          padding: '20px',
          borderRadius: '10px',
          margin: '20px',
          textAlign: 'center',
          boxShadow: '0 4px 8px rgba(0, 0, 0, 0.1)'
        }}>
          <h2>Something went wrong</h2>
          <p>Please try again later.</p>
        </div>
      );
    }

    return this.props.children; 
  }
}

export default ErrorBoundary;