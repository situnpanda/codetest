using Corepoint_E2E_Automation.Corepoint;
using OpenQA.Selenium;
using OpenQA.Selenium.Chrome;

namespace Corepoint_E2E_Automation
{
    internal class Program
    {
        static void Main(string[] args)
        {
            GetSecrets_FromKeyVault.connectToKeyvault();
            //ServiceRestart.mainProgram("px2008", "100.100.133.44");
            //ServiceRestart.mainProgram("px2008", "PSOneHL7test.providence.org");pyxesdbsv067b03.wa.providence.org;pyxesdbsv6ad302.wa.providence.org
            
            IDictionary<string, List<string>> emailDetails = new Dictionary<string, List<string>>();
            IDictionary<string, List<string>> cp_rp = new Dictionary<string, List<string>>();
            cp_rp = ReadFromExcel.cmdbCI_available();
            GetSecrets_FromKeyVault.connectToKeyvault();
            // ServiceRestart.executeFile("APPINTVP-000003.wa.providence.org", "ADTRestart.bat/apolloApplicationPassword");
            GetIncidentNumber inc_no = new GetIncidentNumber();
            LogsData logdata = new LogsData();

            try
            {

                string CoreCmdbCI = string.Empty;
                bool Status = false;
                bool resolved_Status = false;
                int snowFailure = 0;
                int corepointFailure = 0;
                string getAssignedTo = string.Empty;

                /*Calling GetDetails to fetch Incidents*/
                List<List<string>> IncidentResult = GetDetails.GetIncidentDetailsAsync();

                if (IncidentResult.Count == 0)
                {
                    throw new Exception("No Incidents Available");
                }

                int ticketConsiderationFrequency = 0;

                /* Traverse Each and Every Incident */
                int i = 0;
                while (i < IncidentResult.Count)
                {

                    var incident = IncidentResult[i];
                    if (snowFailure >= 2)
                    {
                        Console.WriteLine("SNOW is Down");
                        break;
                    }
                    if (corepointFailure >= 2)
                    {
                        Console.WriteLine("Core Point is Down");
                        break;
                    }

                    logdata.StartDate = DateTime.Now.ToString();

                    /* Initializing ServiceNow Driver*/
                    //IWebDriver ServiceNowdriver = new ChromeDriver(@"C:\Users\sairamanan.mk\source\repos\Chrome Drivers");
                    IWebDriver ServiceNowdriver = new ChromeDriver(@"D:\ChromeDriver");

                    /* Initializing CorePoint Driver*/
                    //IWebDriver CorePointdriver = new ChromeDriver(@"C:\Users\sairamanan.mk\source\repos\Chrome Drivers");
                    IWebDriver CorePointdriver = new ChromeDriver(@"D:\ChromeDriver");
                    string appName = "";
                    try
                    {
                        inc_no.IncidentNumber = incident[0];
                        logdata.IncidentNumber = incident[0];
                        logdata.Status = "Started";
                        logdata.dtTime = incident[2];
                        logdata.StartDate = DateTime.Now.ToString();

                        var pst = TimeZoneInfo.FindSystemTimeZoneById("Pacific Standard Time");
                        double diffMinutes = Math.Abs((TimeZoneInfo.ConvertTime(DateTime.UtcNow, pst) - DateTime.Parse(incident[2].ToString())).TotalMinutes);
                        Console.WriteLine(diffMinutes);
                        /* Retry Mechanism for SNOW Login */
                        for (int SNOWRetry = 1; SNOWRetry < 3; SNOWRetry++)
                        {
                            /* Calling LoginSNOW Instance with driver passing as parameter*/
                            string LoginStatusSnow = LoginServiceNow.LoginSNOW(ServiceNowdriver);
                            if (LoginStatusSnow == string.Empty)
                            {
                                snowFailure = 0;
                                logdata.StepByStep_Status = "Snow Login: Success, ";
                                break;
                            }
                            else
                            {
                                if (SNOWRetry == 2)
                                {
                                    snowFailure += 1;
                                    logdata.Status = "Failed";
                                    logdata.ExceptionType = "ElementNotFoundException";
                                    logdata.Logs = "Unable to Login to SNOW";
                                    logdata.StepByStep_Status = "Snow Login: Fail, ";
                                    throw new Exception("Unable to Login to SNOW");
                                }
                            }
                        }

                        Status = EnterIncident.EnterInc(ServiceNowdriver, incident[0]);
                        resolved_Status = checkIfResolvedInSNOW.checking(ServiceNowdriver);
                        // Status = true;
                        // resolved_Status = true;
                        /* Calling Entering Incident in ServiceNow*/

                        if (Status && resolved_Status)
                        {
                            /*Calling GetRequestDetails to fetch CmcbCI*/
                            var CmdbCIStatus = GetRequestDetails.GetSNOWDetails(ServiceNowdriver);
                            Status = CmdbCIStatus.Status;
                            CoreCmdbCI = CmdbCIStatus.CmdbCI ?? "";
                            Console.WriteLine(CoreCmdbCI);
                            Console.WriteLine(incident[4]);
                            if(incident[4].ToLower().Contains("pyxis")){
                                CoreCmdbCI = incident[4];
                            }
                            if (!cp_rp.ContainsKey(CoreCmdbCI.ToString().Trim()))
                            {
                                Console.WriteLine("Breaking");
                                i += 1;
                                CorePointdriver.Quit();
                                ServiceNowdriver.Quit();
                                continue;
                            }
                        }
                        else
                        {

                            inc_no.IncidentNumber = null;
                            logdata.EndDate = DateTime.Now.ToString();
                            if (!Status)
                            {
                                logdata.Logs = "Unable to Get CMDB_CI from SNOW";
                                logdata.ExceptionType = "ElementNotFound";
                                throw new Exception("Unable to Get CMDB_CI from SNOW \n" + "Incident Number: " + incident[0]);
                            }
                            else if (!resolved_Status)
                            {

                                logdata.Logs = "Ticket Already Resolved";
                                logdata.ExceptionType = "Not an Exception";
                                throw new Exception("DB not refreshed, Ticket Already Resolved");
                            }

                        }
                        appName = CoreCmdbCI.Split("_")[1];
                        Console.WriteLine(appName);
                        Console.WriteLine(CoreCmdbCI);
                        /*Retry Mechanism for CorePoint Login*/
                        for (int CoreRetry = 1; CoreRetry < 3; CoreRetry++)
                        {
                            /* Calling LoginCorePoint Instance with driver passing as parameter*/
                            string CorePointStatus = LoginCorePoint.LoginCorepoint(CorePointdriver, incident[1]);
                            if (CorePointStatus == string.Empty)
                            {
                                corepointFailure = 0;
                                logdata.StepByStep_Status = "Corepoint Login: Success, ";
                                break;
                            }
                            else
                            {
                                if (CoreRetry == 2)
                                {
                                    corepointFailure += 1;
                                    logdata.Status = "Failed";
                                    logdata.ExceptionType = "ElementNotFoundException";
                                    logdata.Logs = CorePointStatus;
                                    logdata.StepByStep_Status = "Corepoint Login: Fail, ";
                                    throw new Exception(CorePointStatus);
                                }
                            }
                        }
                        // Console.WriteLine("Starting the test");
                        // emailDetails = UpdateinServiceNow.UpdateSNOW(ServiceNowdriver, "", false, incident[0], incident[2], emailDetails, incident[3], cp_rp[CoreCmdbCI.ToString()][0], "", appName);
                        // Console.WriteLine("Done Testing");
                        // throw new Exception("Priority Changed\n" + "Incident No: " + incident[0] + "\n Location: " + cp_rp[CoreCmdbCI.ToString()][1]);
                        
                        

                        CorePointDetails corePointDetails = null;
                        if (Status)
                        {
                            /*Calling EnterCI with CorePointdriver as Parameter*/
                            corePointDetails = EnterCI.EnterCmcbCI(CorePointdriver, CoreCmdbCI);
                        }
                        
                        bool Resolved = false;
                        
                        if (corePointDetails?.ConnectionState?.Trim() == "Connected" && corePointDetails?.QueueDepth?.Trim() == "0")
                        {
                            string msg = "Connection status: " + corePointDetails?.ConnectionState?.Trim() + "\n Queue Depth: " + corePointDetails?.QueueDepth?.Trim();
                            string restartedEntity = "";
                            
                            if (cp_rp[CoreCmdbCI.ToString()][1].StartsWith("https"))
                            {
                                restartedEntity = "interface";
                            }
                            else if(CoreCmdbCI.ToString().Contains("Apollo"))
                            {
                                restartedEntity = "serviceFile";
                            }
                            else
                            {
                                restartedEntity = "service";
                            }

                            Resolved = true;
                            var UpdateComment = FetchCorePointDetails.Screenshot(CorePointdriver);
                            emailDetails = UpdateinServiceNow.UpdateSNOW(ServiceNowdriver, UpdateComment?.UpdateComments ?? "", Resolved, incident[0], incident[2], emailDetails, incident[3], cp_rp[CoreCmdbCI.ToString()][0], restartedEntity, appName);
                            SendEmail.resolvedEmail(msg, incident[0],restartedEntity, appName);
                            logdata.Status = "Resolved";
                            logdata.Logs = "Completed Automation For the Incident";
                        }
                        else
                        {
                            //Resolved = false;
                            IDictionary<string, List<string>> loc_rpORsvc = new Dictionary<string, List<string>>();
                            try
                            {
                                loc_rpORsvc.Add(cp_rp[CoreCmdbCI.ToString()][1], new List<string>() { cp_rp[CoreCmdbCI.ToString()][0].Split(" ")[0] });
                            }
                            catch (Exception ex)
                            {
                                throw new Exception("Cant add cmdbci\n" + ex.Message);
                            }

                            if (cp_rp[CoreCmdbCI.ToString()][1].StartsWith("https"))
                            {
                                Console.WriteLine(loc_rpORsvc);
                                InterfaceRestart.mainProgram(loc_rpORsvc);
                                logdata.Status = "On Hold";
                                throw new Exception("Raphsody Interface Restarted\n" + "Incident No: " + incident[0] + "\n URL: " + cp_rp[CoreCmdbCI.ToString()][1] + "\n Raphsody Interface: " + cp_rp[CoreCmdbCI.ToString()][0].Split(" ")[0]);
                            }
                            else if(cp_rp[CoreCmdbCI.ToString()][1] != "Not Supported")
                            {
                                string serverIP = string.Empty;
                                if(corePointDetails.PeerIp.Trim() == null || corePointDetails.PeerIp.Trim() == string.Empty)
                                {
                                    serverIP = cp_rp[CoreCmdbCI.ToString()][1];
                                }
                                else
                                {
                                    serverIP = corePointDetails.PeerIp.Trim();
                                }
                                if (CoreCmdbCI.Contains("Apollo"))
                                {
                                    string statusOfService = ServiceRestart.executeFile(serverIP, cp_rp[CoreCmdbCI.ToString()][0]);//corePointDetails.PeerIp.Trim());
                                    logdata.StepByStep_Status = logdata.StepByStep_Status + statusOfService;
                                }
                                else
                                {
                                    string pwdKey = "";
                                    string userName = "";
                                    if(CoreCmdbCI.ToLower().Contains("powerscribe")){
                                        userName = "svc.isaccprovision@providence.org";
                                        pwdKey = "serviceAccntPWD";
                                    }
                                    else if(CoreCmdbCI.ToLower().Contains("pyxis")){
                                        userName = "servAPM0007868ID002@providence.org";
                                        pwdKey = "serviceAccountPwdPyxis";
                                    }
                                    if (CoreCmdbCI.ToLower().Contains("pyxis") && diffMinutes>=30 && incident[3].ToString()=="4")
                                    {
                                        Console.WriteLine("helloooooo");
                                        emailDetails = UpdateinServiceNow.UpdateSNOW(ServiceNowdriver, "", false, incident[0], incident[2], emailDetails, incident[3], cp_rp[CoreCmdbCI.ToString()][0], "", appName);
                                        throw new Exception("Priority Changed\n" + "Incident No: " + incident[0] + "\n Location: " + cp_rp[CoreCmdbCI.ToString()][1]);
                                    }
                                    
                                    string statusOfService = ServiceRestart.mainProgram(cp_rp[CoreCmdbCI.ToString()][0], serverIP, userName, pwdKey);//corePointDetails.PeerIp.Trim());
                                    logdata.StepByStep_Status = logdata.StepByStep_Status + statusOfService;
                                    
                                }
                                
                                logdata.Status = "On Hold";
                                
                                throw new Exception("Service Restarted\n" + "Incident No: " + incident[0] + "\n Location: " + cp_rp[CoreCmdbCI.ToString()][1] + "\n Service: " + cp_rp[CoreCmdbCI.ToString()][0].Split(" ")[0]);
                            }

                        }

                        logdata.EndDate = DateTime.Now.ToString();
                        LogDB_connection.InsertLogs(logdata.IncidentNumber, logdata.Logs, logdata.Status, logdata.ExceptionType, logdata.dtTime, logdata.StartDate, logdata.EndDate, CoreCmdbCI.ToString());
                        CorePointdriver.Quit();

                        ServiceNowdriver.Quit();
                        i += 1;
                        ticketConsiderationFrequency = 0;
                        inc_no.IncidentNumber = null;

                    }
                    catch (Exception ex)
                    {
                        //KillProcess.KillProcesses();
                        CorePointdriver.Quit();
                        ServiceNowdriver.Quit();
                        string inc = inc_no.IncidentNumber == null ? "Initialization" : inc_no.IncidentNumber;
                        LogDB_connection.InsertLogs(inc, ex.Message, logdata.Status, logdata.ExceptionType, logdata.dtTime, logdata.StartDate, logdata.EndDate, CoreCmdbCI);
                        inc_no.IncidentNumber = null;
                        ticketConsiderationFrequency += 1;
                        if (ex.Message != "DB not refreshed, Ticket Already Resolved" && ticketConsiderationFrequency < 1)
                        {
                            continue;
                        }
                        if (ex.Message != "No Incidents Available" && (!ex.Message.Contains("Execution Timeout Expired")))
                        {
                            SendEmail.errorEmail(ex.Message.ToString(), appName);
                        }
                        ticketConsiderationFrequency = 0;
                        i += 1;

                    }
                }

                //SendEmail.SendEmails(emailDetails);
                Environment.Exit(0);
                KillProcess.KillProcesses();
            }

            catch (Exception ex)
            {
                //SendEmail.errorEmail(ex.Message);
                if (ex.Message != "No Incidents Available" && (!ex.Message.Contains("Execution Timeout Expired")))
                {
                    SendEmail.errorEmail(ex.Message, "");
                }

                if (ex.Message != "Unable to Connect to Key Vault" )
                {
                    Console.WriteLine(ex.Message);
                    string inc = inc_no.IncidentNumber == null ? "Initialization" : inc_no.IncidentNumber;
                    LogDB_connection.InsertLogs(inc, ex.Message.ToString(), logdata.Status, logdata.ExceptionType, logdata.dtTime, logdata.StartDate, logdata.EndDate, "");
                }
                Environment.Exit(0);

            }
        }
    }
}
