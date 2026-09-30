import React, { useEffect, useState } from "react";
import {
  Typography,
  Box,
  TextField,
  Button,
  Container,
  Stack,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from "@mui/material";
import UploadIcon from "@mui/icons-material/Upload";
import DnsIcon from "@mui/icons-material/Dns";
import NumbersIcon from "@mui/icons-material/Numbers";
import { getUrl } from "../../../environment";
import NorthStarLogo from "../../Static/Images/NorthStarLogo.png";

const baseUrl = getUrl();

function fetchApmApiEndpoint() {
  return fetch(baseUrl + "getSecrets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secretName: "dust-api-endpoint" }),
  })
    .then((response) => {
      if (!response.ok) {
        return response.json().then((errorData) => {
          throw new Error(errorData.error || "Failed to fetch API endpoint");
        });
      }
      return response.json();
    })
    .then((data) => data.Data)
    .catch((error) => {
      console.error("[NorthStar] Error fetching API endpoint:", error);
      return null;
    });
}

export default function NorthStarHome({ userProfileData }) {
  const email = userProfileData.mail;
  const [textFieldInput, setTextFieldInput] = useState("");
  const [selectedIcon, setSelectedIcon] = useState("server");
  const [showValidation, setShowValidation] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [apiError, setApiError] = useState(false);
  const [errorMessage, setErrorMessage] = useState(
    "Something went wrong, please retry."
  );

  const buttons = [
    { id: "server", label: "Server Name", icon: <DnsIcon /> },
    { id: "apm", label: "APM Number", icon: <NumbersIcon /> },
  ];

  const trimmedInput = textFieldInput.trim();
  const isEmpty = trimmedInput === "";
  const apmRegex = /^apm\d{7}$/i;
  const zeroApmRegex = /^apm0{7}$/i;
  const apmPrefixRegex = /^apm/i;
  // A valid APM must match the format and not be the all-zero placeholder
  const isValidApm = apmRegex.test(trimmedInput) && !zeroApmRegex.test(trimmedInput);
  // Server input may be comma-separated; no token may start with "APM"
  const serverContainsApm = trimmedInput
    .split(",")
    .some((token) => apmPrefixRegex.test(token.trim()));
  // Apply APM format validation when APM is selected; block APM numbers for server input
  const showError =
    isEmpty ||
    (selectedIcon === "apm" && !isValidApm) ||
    (selectedIcon === "server" && serverContainsApm);

  let validationMessage = "";
  if (isEmpty) {
    validationMessage = "This field cannot be empty.";
  } else if (selectedIcon === "apm") {
    if (zeroApmRegex.test(trimmedInput)) {
      validationMessage = "APM0000000 is not a valid APM number.";
    } else if (!apmRegex.test(trimmedInput)) {
      validationMessage =
        "Invalid APM format. Use APM followed by 7 numbers (e.g., APM1234567).";
    }
  } else if (selectedIcon === "server" && serverContainsApm) {
    validationMessage =
      "Server name cannot be an APM number. Please enter a valid server name.";
  }

  const handleSubmit = async () => {
    console.log("Submit button clicked");
    setShowValidation(true);

    if (showError) return;

    setApiError(false);
    setShowValidation(false);
    setTextFieldInput("");

    var payload = {};
    console.log("Selected Icon: ", selectedIcon);
    if (selectedIcon === "apm") {
      payload = {
        EmployeeAccountName: email,
        APMNumber: textFieldInput,
        ServerName: "",
      };
    } else {
      payload = {
        EmployeeAccountName: email,
        APMNumber: "",
        ServerName: textFieldInput,
      };
    }
    console.log("API call in progress, Payload: " + JSON.stringify(payload));
    setDialogOpen(true);
    console.log("Has Error: ", showError);
    const url = await fetchApmApiEndpoint();

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      console.log("API Response:", data);

      if (response.ok) {
        console.log("API call successful");
      } else {
        setApiError(true);
        setDialogOpen(true);
        setErrorMessage(data.message);
        console.error("API Error: ", data);
      }
    } catch (error) {
      setApiError(true);
      setDialogOpen(true);
      setErrorMessage(error.message || "Network Error");
      console.error("Fetch Exception: ", error);
    }
  };

  return (
    <Container maxWidth="xl" sx={{ py: 4, overflowY: "disabled" }}>
      {/* Title Section */}
      <Box sx={{ paddingTop: 2 }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 2,
          }}
        >
          <Box
            component="img"
            src={NorthStarLogo}
            alt="North Star logo"
            sx={{ width: 72, height: 72, objectFit: "contain" }}
          />
          <Typography
            variant="h3"
            sx={{ color: "#00338E", textAlign: "center", fontWeight: "bold" }}
          >
            NORTH STAR
          </Typography>
          {/* Placeholder image beside North Star logo; replace src when image is available */}
        </Box>
        <Typography
          variant="body1"
          sx={{
            mt: 4,
            width: "90%",
            mx: "auto",
            textAlign: "center",
            color: "#000000DE",
          }}
        >
          When applications are retired, the current process predominantly
          concentrates on decommissioning servers and updating the APM record in
          Service Now. However, this approach frequently overlooks numerous
          associated resources, leading to unnecessary costs and operational
          clutter. The North Star solution aims to revolutionize this process by
          ensuring a comprehensive and meticulous cleanup of all ancillary
          resources. It will provide a comprehensive view of an application
          related resources or server specific details on demand.
        </Typography>
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{
            mt: 2.5,
            mb: 5,
            mx: "auto",
            width: "80%",
            textAlign: "center",
            backgroundColor: "#F9F9F9",
            p: 2,
            borderRadius: "8px",
            border: "1px solid #EEE",
          }}
        >
          <strong>Disclaimer:</strong> This process will take sometime to
          produce the report for an APM Number. The average runtime would be{" "}
          <strong>30 - 45 minutes</strong>. This can go beyond that based on the
          servers' list tagged with the APM Number. The report will be sent to
          your email id.
        </Typography>
      </Box>

      {/* Input Section */}
      <Box
        sx={{
          p: 2,
          minWidth: "80%",
          mx: "auto",
          border: "1px solid #CCC",
          borderRadius: 2,
          backgroundColor: "#F9F9F9",
        }}
      >
        <Box display="flex">
          <TextField
            fullWidth
            id="text-field"
            placeholder={
              selectedIcon === "apm"
                ? "Enter APM Number (Input only 1 APM number) "
                : "Enter Server Name(s) (Comma separated for multiple servers) "
            }
            variant="outlined"
            value={textFieldInput}
            onChange={(e) => {
              setTextFieldInput(e.target.value);
              setShowValidation(false);
            }}
            error={showValidation && showError}
            helperText={showValidation ? validationMessage : ""}
            sx={{ backgroundColor: "#FFFFFF" }}
          />
          <Button
            variant="contained"
            onClick={handleSubmit}
            sx={{
              backgroundColor: "#00338E",
              color: "#FFFFFF",
              borderRadius: "15px",
              padding: "5px 40px",
              whiteSpace: "nowrap",
              "&:hover": {
                backgroundColor: "#162f6a",
              },
              marginLeft: 1,
              height: 55,
            }}
          >
            Submit
          </Button>
          <Box display="flex" alignItems="center" sx={{ p: 1, height: 50 }}>
            <Typography>or</Typography>
          </Box>
          <Button
            variant="contained"
            startIcon={<UploadIcon />}
            disabled={true}
            sx={{
              backgroundColor: "#00338E",
              color: "#FFFFFF",
              borderRadius: "15px",
              padding: "5px 40px",
              whiteSpace: "nowrap",
              height: 55,
              "&:hover": {
                backgroundColor: "#1E3A8A",
              },
            }}
          >
            BULK UPLOAD
          </Button>
        </Box>

        {/* Buttons */}
        <Box display="flex" justifyContent="space-between">
          <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
            {buttons.map((btn) => (
              <Button
                style={{ textTransform: "none" }}
                key={btn.id}
                variant="outlined"
                startIcon={btn.icon}
                onClick={() => setSelectedIcon(btn.id)}
                sx={{
                  borderRadius: "50px",
                  borderWidth: "2px",
                  borderColor:
                    selectedIcon === btn.id ? "#00338E" : "transparent",
                  color: "#8b9099",
                  backgroundColor: selectedIcon === btn.id ? "#fff" : "#FFFFFF",
                  "&:hover": {
                    backgroundColor: "#f1f3f5",
                    borderColor: "transparent",
                  },
                }}
              >
                {btn.label}
              </Button>
            ))}
          </Stack>
        </Box>
      </Box>

      {/* Dialog box - opens after submit button is clicked, while API is running or if error occurs */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)}>
        {apiError && (
          <DialogTitle sx={{ color: "#d11f19ff" }}>Error</DialogTitle>
        )}
        <DialogContent>
          <DialogContentText
            sx={apiError ? { color: "#d11f19ff" } : { color: "#0E4A65" }}
          >
            {apiError && errorMessage
              ? errorMessage
              : selectedIcon === "apm"
              ? "Thank you, Report generation submission in queue. Please note that it may take up to 30 minutes to generate a full report. Once the report is complete it will be sent via email. "
              : "Thank you, Report generation submission in queue. Please note that it may take up to 1 minute to generate the report for the provided server. Once the report is complete it will be sent via email."}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setDialogOpen(false)}
            sx={{
              backgroundColor: "#00338e",
              color: "#FFFFFF",
              borderRadius: "15px",
              padding: "5px 40px",
              "&:hover": { backgroundColor: "#162f6a" },
            }}
          >
            OK
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}