import React, { useState } from "react";
import HelpIcon from "@mui/icons-material/Help";
import SmsFailedIcon from "@mui/icons-material/SmsFailed";
import CloseIcon from "@mui/icons-material/Close";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  RadioGroup,
  FormControlLabel,
  Radio,
  Typography,
  Box,
  IconButton,
  Tooltip,
  CircularProgress,
} from "@mui/material";

export default function ItelemetryFeedback({ userProfileData }) {
  const email = userProfileData.mail;
  const [feedbackDialogOpen, setFeedbackDialogOpen] = useState(false);
  const [showValidation, setShowValidation] = useState(false);

  // --- Feedback form state ---
  const [feedbackType, setFeedbackType] = useState("Issue");
  const [featureTitle, setFeatureTitle] = useState("");
  const [featureDesc, setFeatureDesc] = useState("");
  const [featureServerName, setFeatureServerName] = useState("");
  const [file, setFile] = useState(null);
  const [impact, setImpact] = useState("");

  // Status dialog state
  const [statusOpen, setStatusOpen] = useState(false);
  const [statusMode, setStatusMode] = useState("progress");
  const [statusMessage, setStatusMessage] = useState("");

  // --- Dialog handlers ---
  const openHelpLink = () => {
    const url =
      "https://providence4.sharepoint.com/:f:/r/sites/CRCAAutomationCommunity/Shared%20Documents/Engineering%20Automations/DUST%20Automation?csf=1&web=1&e=y9OKeE&xsdata=MDV8MDJ8fDViM2JjMzFlOTQ4OTQ4Yzk5YjhhMDhkZTM2ZmNlNWIxfDJlMzE5MDg2OWEyNjQ2YTM4NjVmNjE1YmVkNTc2Nzg2fDB8MHw2MzkwMDg2NTY5NDY0Njk3NzB8VW5rbm93bnxWR1ZoYlhOVFpXTjFjbWwwZVZObGNuWnBZMlY4ZXlKRFFTSTZJbFJsWVcxelgwRlVVRk5sY25acFkyVmZVMUJQVEU5R0lpd2lWaUk2SWpBdU1DNHdNREF3SWl3aVVDSTZJbGRwYmpNeUlpd2lRVTRpT2lKUGRHaGxjaUlzSWxkVUlqb3hNWDA9fDF8TDJOb1lYUnpMekU1T2pReFlUYzFOalF5TFdObFpHTXRORFEyTVMxaVpXSmtMV1F6TlRSbFl6QXhOekl4TWw4NU5qTTROVFZtTlMwMk1ERmlMVFJoWkRRdFlqTTBaUzB5WW1Kak1UUTFObVZtWVRCQWRXNXhMbWRpYkM1emNHRmpaWE12YldWemMyRm5aWE12TVRjMk5USTJPRGc1TXpneE5BPT18M2I2MzRmYmE0Mzk5NDBiNGZlZmEwOGRlMzZmY2U1YjB8ZWZmZTAxMzdiNjVhNDlkMjgwNjAxZDlhNjk2MzNhN2Q%3D&sdata=N01kNTZxZnNiNk9TWWRGY3lzd2NFNXpwRmJUR2tQWDRkVnJGNDVEOStldz0%3D&ovuser=2e319086-9a26-46a3-865f-615bed576786%2Caritra.pal%40providence.org&OR=Teams-HL&CT=1765271164624&clickparams=eyJBcHBOYW1lIjoiVGVhbXMtRGVza3RvcCIsIkFwcFZlcnNpb24iOiI0OS8yNTExMDIwMjMxNSIsIkhhc0ZlZGVyYXRlZFVzZXIiOmZhbHNlfQ%3D%3D";
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleFeedbackOpen = () => setFeedbackDialogOpen(true);
  const handleFeedbackClose = () => {
    setFeedbackDialogOpen(false);
    setFeedbackType("Issue");
    setFeatureTitle("");
    setFeatureDesc("");
    setFeatureServerName("");
    setFile(null);
    setImpact("");
    setShowValidation(false);
  };

  // Convert file to base64 for upload
  const fileToBase64 = (file) =>
    new Promise((resolve, reject) => {
      if (!file) return resolve("");
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });

  // --- Feedback submit ---
  const handleSubmitFeedback = async () => {
    console.log("Submitting feedback...");

    // Validation
    if (
      !featureTitle.trim() ||
      !featureDesc.trim() ||
      (feedbackType === "Issue" && (!featureServerName.trim() || impact === ""))
    ) {
      setShowValidation(true);
      console.log("Validation failed. Please fill all required fields.");
      return;
    }

    console.log("Validation passed. Proceeding with submission.");
    setShowValidation(false);

    // Close the feedback dialog immediately and show status dialog
    setFeedbackDialogOpen(false);
    setStatusOpen(true);
    setStatusMode("progress");
    setStatusMessage("Feedback submission in progress. Please wait...");

    console.log("API Call in progress...");

    // Build payload according to Logic App schema
    const base64Content = await fileToBase64(file).catch(() => "");
    const payload = {
      type: feedbackType,
      person: email,
      issueTitle: feedbackType === "Issue" ? featureTitle : "",
      serverName: feedbackType === "Issue" ? featureServerName : "",
      issueDetails: feedbackType === "Issue" ? featureDesc : "",
      impact: feedbackType === "Issue" ? impact : "",
      enhancementTitle:
        feedbackType === "Enhancement Request" ? featureTitle : "",
      enhancementDetails:
        feedbackType === "Enhancement Request" ? featureDesc : "",
      fileName: file?.name || "",
      fileContent: base64Content,
    };

    const LOGIC_APP_URL =
      "https://la-monitoring-workflows.azurewebsites.net:443/api/ItelemetryFeedbackForm/triggers/When_an_HTTP_request_is_received/invoke?api-version=2022-05-01&sp=%2Ftriggers%2FWhen_an_HTTP_request_is_received%2Frun&sv=1.0&sig=5XnF7igQK6yJYJz_UuPTPRmVs8H-0bvninbgKsHPCOk"
    try {
      const resp = await fetch(LOGIC_APP_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const text = await resp.text();
      const data = text ? JSON.parse(text) : {};
      console.log("Logic App response:", resp.status, data);
      if (resp.ok) {
        setStatusMode("success");
        setStatusMessage(
          "Thank you! Your feedback was submitted successfully."
        );
        handleFeedbackClose();
      } else {
        setStatusMode("error");
        setStatusMessage(
          (data && (data.message || data.error)) ||
            "Submission failed. Please try again later."
        );
      }
    } catch (err) {
      console.error("Failed to call Logic App:", err);
      setStatusMode("error");
      setStatusMessage("Network error while submitting feedback.");
    } finally {
      setStatusOpen(true);
    }
  };

  return (
    <Box sx={{ display: "flex", gap: 2, alignItems: "center" }}>
      {/* Feedback Icon */}
      <Tooltip title="Click here to report an issue and provide feedback" arrow>
        <IconButton onClick={handleFeedbackOpen} aria-label="feedback">
          <SmsFailedIcon />
        </IconButton>
      </Tooltip>

      {/* Feedback Dialog */}
      <Dialog
        open={feedbackDialogOpen}
        onClose={handleFeedbackClose}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: { borderRadius: 2, overflow: "hidden" },
        }}
      >
        <DialogTitle
          sx={{ bgcolor: "#00338e", color: "#fff", fontWeight: 700, p: 2 }}
        >
          <Box sx={{ display: "flex", alignItems: "center" }}>
            <Typography component="span" sx={{ flexGrow: 1, fontWeight: 700 }}>
              Feedback: Report Bugs and Request Features
            </Typography>
            <IconButton
              aria-label="close"
              onClick={handleFeedbackClose}
              sx={{ color: "#fff" }}
            >
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>

        <DialogContent sx={{ pt: 3 }}>
          {/* Feedback Type */}
          <Typography sx={{ mt: 3, fontWeight: 500 }}>
            Feedback Type *
          </Typography>
          <RadioGroup
            row
            value={feedbackType}
            onChange={(e) => setFeedbackType(e.target.value)}
          >
            <FormControlLabel value="Issue" control={<Radio />} label="Issue" />
            <FormControlLabel
              value="Enhancement Request"
              control={<Radio />}
              label="Enhancement Request"
            />
          </RadioGroup>

          {/* Feature Title with max length & counter */}
          <TextField
            label={
              feedbackType === "Issue" ? "Issue Title *" : "Feature Title *"
            }
            fullWidth
            variant="outlined"
            sx={{ mt: 2 }}
            value={featureTitle}
            onChange={(e) => setFeatureTitle(e.target.value.slice(0, 250))}
            error={showValidation && !featureTitle.trim()}
            inputProps={{ maxLength: 250 }}
            helperText={
              showValidation && !featureTitle.trim()
                ? `${
                    feedbackType === "Issue"
                      ? "Issue Title"
                      : "Enhancement Request Title"
                  } is required.`
                : `${featureTitle.length} / 250`
            }
            FormHelperTextProps={{
              sx: {
                textAlign:
                  showValidation && !featureTitle.trim() ? "left" : "right",
                width: "100%",
                mt: 1,
                pr: 3,
              },
            }}
          />

          {feedbackType === "Issue" && (
            <TextField
              label="Enter Server Name or APM Name / Number *"
              fullWidth
              variant="outlined"
              sx={{ mt: 2, mb: 2 }}
              value={featureServerName}
              onChange={(e) => setFeatureServerName(e.target.value)}
              error={showValidation && !featureServerName.trim()}
              helperText={
                showValidation && !featureServerName.trim()
                  ? "Server Name or APM Name / Number is required."
                  : undefined
              }
            />
          )}

          {/* Description with max length & counter */}
          <TextField
            label={
              feedbackType === "Issue"
                ? "Please provide the details of the issue *"
                : "Describe the feature required *"
            }
            fullWidth
            multiline
            rows={4}
            variant="outlined"
            sx={{ mt: 2 }}
            value={featureDesc}
            onChange={(e) => {
              setFeatureDesc(e.target.value.slice(0, 2000));
            }}
            inputProps={{ maxLength: 2000 }}
            error={showValidation && !featureDesc.trim()}
            helperText={
              showValidation && !featureDesc.trim()
                ? `${
                    feedbackType === "Issue"
                      ? "Issue Description"
                      : "Enhancement Request Description"
                  } is required.`
                : `${featureDesc.length} / 2000`
            }
            FormHelperTextProps={{
              sx: {
                textAlign:
                  showValidation && !featureDesc.trim() ? "left" : "right",
                width: "100%",
                mt: 1,
                pr: 3,
              },
            }}
          />

          {feedbackType === "Issue" && (
            <Box>
              {/* Impact selection */}
              <Typography
                sx={{
                  mt: 1,
                  fontWeight: 500,
                  color:
                    impact === "" && showValidation
                      ? "error.main"
                      : "text.primary",
                }}
              >
                Impact *
              </Typography>
              <RadioGroup
                value={impact}
                onChange={(e) => setImpact(e.target.value)}
                aria-label="impact"
                name="impact"
                sx={{ mt: 1, gap: 1 }}
              >
                <FormControlLabel
                  value="Critical"
                  control={<Radio />}
                  label={
                    <Box>
                      <Typography fontWeight={450} component="span">
                        Critical
                      </Typography>
                      <Typography
                        variant="caption"
                        component="span"
                        color="text.secondary"
                        sx={{ marginLeft: 1 }}
                      >
                        - Affecting global user base
                      </Typography>
                    </Box>
                  }
                />
                <FormControlLabel
                  value="High"
                  control={<Radio />}
                  label={
                    <Box>
                      <Typography fontWeight={450} component="span">
                        High
                      </Typography>
                      <Typography
                        variant="caption"
                        component="span"
                        color="text.secondary"
                        sx={{ marginLeft: 1 }}
                      >
                        - Affecting multiple departments with many users
                      </Typography>
                    </Box>
                  }
                />
                <FormControlLabel
                  value="Medium"
                  control={<Radio />}
                  label={
                    <Box>
                      <Typography fontWeight={450} component="span">
                        Medium
                      </Typography>
                      <Typography
                        variant="caption"
                        component="span"
                        color="text.secondary"
                        sx={{ marginLeft: 1 }}
                      >
                        - Affecting multiple departments with limited users
                      </Typography>
                    </Box>
                  }
                />
                <FormControlLabel
                  value="Low"
                  control={<Radio />}
                  label={
                    <Box>
                      <Typography fontWeight={450} component="span">
                        Low
                      </Typography>
                      <Typography
                        variant="caption"
                        component="span"
                        color="text.secondary"
                        sx={{ marginLeft: 1 }}
                      >
                        - Affecting limited departments (or) Not Applicable
                      </Typography>
                    </Box>
                  }
                />
              </RadioGroup>
            </Box>
          )}

          {/* File Upload */}
          <Box sx={{ mt: 2, display: "flex", alignItems: "center" }}>
            <Button
              variant="outlined"
              component="label"
              sx={{
                backgroundColor: "#00338E",
                color: "#FFFFFF",
                borderRadius: "10px",
                whiteSpace: "nowrap",
                "&:hover": {
                  backgroundColor: "#162f6a",
                },
              }}
            >
              Choose Files
              <input
                type="file"
                hidden
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </Button>
            <Typography sx={{ ml: 2 }}>
              {file ? file.name : "No file chosen"}
            </Typography>
          </Box>
        </DialogContent>

        {/* Actions */}
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={handleFeedbackClose}
            variant="outlined"
            sx={{
              borderRadius: "10px",
              whiteSpace: "nowrap",
              borderColor: "#00338E",
              borderWidth: "1px",
              color: "#00338E",
              "&:hover": { backgroundColor: "#e3eaf6" },
            }}
          >
            CANCEL
          </Button>
          <Button
            onClick={handleSubmitFeedback}
            variant="contained"
            sx={{
              backgroundColor: "#00338E",
              color: "#FFFFFF",
              borderRadius: "10px",
              whiteSpace: "nowrap",
              "&:hover": {
                backgroundColor: "#162f6a",
              },
            }}
          >
            SUBMIT
          </Button>
        </DialogActions>
      </Dialog>

      {/* Submission Status Dialog */}
      <Dialog
        open={statusOpen}
        onClose={() => setStatusOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ p: 2 }}>
          <Box sx={{ display: "flex", alignItems: "center" }}>
            <Typography
              component="span"
              sx={{
                flexGrow: 1,
                fontWeight: "bold",
                color: statusMode === "error" ? "error.main" : "#00338E",
                paddingLeft: 1,
              }}
            >
              {statusMode === "progress"
                ? "Submitting Feedback"
                : statusMode === "success"
                ? "Success"
                : "Error"}
            </Typography>
            <IconButton aria-label="close" onClick={() => setStatusOpen(false)}>
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent>
          {statusMode === "progress" ? (
            <Box sx={{ display: "flex", alignItems: "center", gap: 2, py: 1 }}>
              <CircularProgress size={24} />
              <Typography>{statusMessage}</Typography>
            </Box>
          ) : (
            <Typography
              color={statusMode === "error" ? "error.main" : "text.primary"}
            >
              {statusMessage}
            </Typography>
          )}
        </DialogContent>
        {statusMode !== "progress" && (
          <DialogActions>
            <Button
              onClick={() => setStatusOpen(false)}
              variant="outlined"
              sx={{
                marginRight: 2,
                marginBottom: 1,
                borderRadius: "10px",
                whiteSpace: "nowrap",
                borderColor: "#00338E",
                borderWidth: "1px",
                color: "#00338E",
                "&:hover": { backgroundColor: "#e3eaf6" },
              }}
            >
              Close
            </Button>
          </DialogActions>
        )}
      </Dialog>
    </Box>
  );
}
