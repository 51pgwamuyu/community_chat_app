import {
    Canister,
    Err,
    Ok,
    Principal,
    Record,
    Result,
    StableBTreeMap,
    Variant,
    Vec,
    ic,
    nat64,
    query,
    text,
    update,
  } from "azle";
  const User = Record({
    id: Principal,
    username: text,
    groupsCrated: Vec(text),
    createdAt: nat64,
  });
  const directMessage = Record({
    from: Principal,
    messagetext: text,
  });
  const message = Record({
    id: Principal,
    sender: Principal,
    messageText: text,
    createdAt: nat64,
  });
  type message = typeof message.tsType;
  const Communities = Record({
    id: Principal,
    owner: Principal,
    nameOfCommunity: text,
    members: Vec(text),
    messages: Vec(message),
    createdAt: nat64,
  });
  //payloads
  const userPayload = Record({
    username: text,
  });
  
  type User = typeof User.tsType;
  const communitiesPayload = Record({
    nameOfCommunity: text,
    usernameOfCreator: text,
  });
  const deleteCommunityPyload = Record({
    owner: Principal,
    nameOfCommunty: text,
  });
  const joinCommunityPayload = Record({
    username: text,
    groupName: text,
  });
  const exitCommunityPayload = Record({
    username: text,
    groupName: text,
  });
  const removeUserPayload = Record({
    owner: Principal,
    nameOfCommunity: text,
    user: text,
  });
  const sendMessagePayLoad = Record({
    messageToSend: text,
    communityName: text,
    username: text,
  });
  const messageRetriverPayLoad = Record({
    username: text,
    groupname: text,
  });
  type Communities = typeof Communities.tsType;
  const communityReturnType =Record({
    name:text,
    owner:Principal
  })
  type communityReturnType = typeof communityReturnType .tsType;
  //errors
  const communityAppErrors = Variant({
    communityDoesNotExist: text,
    communityAlreadyExist: text,
    UserDoesNotExist: text,
    EnterCorrectDetais: text,
    GroupNameIsRequired: text,
    NoMessageWithSuchId: text,
    userNameAlreadyExist: text,
    usernameIsRequired: text,
    credentialsMissing: text,
    onlyOwnerCanDelete: text,
    ErrorWhenExitingGropu: text,
    NotAMemberOfGroup: text,
    AlreadyAmember: text,
  });
  type communityAppErrorsE = typeof communityAppErrors.tsType;
  //storages
  const userStorages = StableBTreeMap<text, User>(0);
  const communitiesStorage = StableBTreeMap<text, Communities>(1);
  const communityGroupStorages = StableBTreeMap<text, communityReturnType>(2);
  export default Canister({
    //user register to cht app
    registerUser: update(
      [userPayload],
      Result(text, communityAppErrors),
      (payload) => {
        if (!payload.username) {
          return Err({ usernameIsRequired: "username is required" });
        }
        //check if username is already taken
        const getUser = userStorages.get(payload.username).Some;
        if (getUser) {
          return Err({
            userNameAlreadyExist: "username i laready taken try another one",
          });
        }
        //create user
        const createUser: User = {
          id: ic.caller(),
          username: payload.username,
          groupsCrated: [],
          createdAt: ic.time(),
        };
        userStorages.insert(payload.username, createUser);
        return Ok(`user with ${payload.username} has been created successfully`);
      }
    ),
    //user create a community
    createCommunity: update(
      [communitiesPayload],
      Result(text, communityAppErrors),
      (payload) => {
        if (!payload.nameOfCommunity) {
          return Err({ credentialsMissing: `community name is missing` });
        }
        //check if community already exist
        const findCommunity = communitiesStorage.get(
          payload.nameOfCommunity
        ).Some;
        if (findCommunity) {
          return Err({
            communityAlreadyExist: `comunity with ${payload.nameOfCommunity} already exist`,
          });
        }
        //check if user is already registered
        const getUser = userStorages.get(payload.usernameOfCreator).Some;
        if (!getUser) {
          return Err({
            UserDoesNotExist: `user with ${payload.usernameOfCreator} is not registered`,
          });
        }
        //create community
        const idOfOwner=generateId()
        const id=ic.caller()
        const createCommunity: Communities = {
          id,
          owner: ic.caller(),
          nameOfCommunity: payload.nameOfCommunity,
          members: [payload.usernameOfCreator],
          messages: [],
          createdAt: ic.time(),
        };
        const communityGroups:communityReturnType ={
          name:payload.nameOfCommunity,
          owner:id
        }
        communityGroupStorages.insert(
          payload.nameOfCommunity,
        communityGroups
        );
        communitiesStorage.insert(payload.nameOfCommunity, createCommunity);
        //update on user side
        const updateUserWithCommunity: User = {
          ...getUser,
          groupsCrated: [...getUser.groupsCrated, payload.nameOfCommunity],
        };
        userStorages.insert(payload.usernameOfCreator, updateUserWithCommunity);
  
        return Ok(
          `${payload.nameOfCommunity} community has been created successfully`
        );
      }
    ),
    //get all created commuities
    getAllCommunities: query([], Vec(communityReturnType),() => {
      return communityGroupStorages.values();
    }),
    //delete community
    deleteCommunity: update(
      [deleteCommunityPyload],
      Result(text, communityAppErrors),
      (payload) => {
        if (!payload.nameOfCommunty || !payload.owner) {
          return Err({ credentialsMissing: "some credentials are missing" });
        }
        //check if community group already exist
        const checkGroup = communitiesStorage.get(payload.nameOfCommunty).Some;
        if (!checkGroup) {
          return Err({
            communityDoesNotExist: `${payload.nameOfCommunty} does not exist`,
          });
        }
        //check if its owner deleting the group
        if (checkGroup.owner.toText() !== payload.owner.toText()) {
          return Err({
            onlyOwnerCanDelete: "only owner can delete the community",
          });
        }
        communitiesStorage.remove(payload.nameOfCommunty);
        communityGroupStorages.remove(payload.nameOfCommunty);
        //remove from user created community arrays
  
        return Ok(`${payload.nameOfCommunty} has been successufully deleted`);
      }
    ),
    //users joins the community
    joinGroup: update([joinCommunityPayload], text, (payload) => {
      if (!payload.groupName || !payload.username) {
        return "missing credentials";
      }
      //check if user is already registered
      const getUser = userStorages.get(payload.username).Some;
      if (!getUser) {
        return `user with given ${payload.username} deos not exist`;
      }
      //check if group already exist
      const getGroup = communitiesStorage.get(payload.groupName).Some;
      if (!getGroup) {
        return `${payload.groupName} does not exist`;
      }
  
      //check if user is already in the community group
      const checkUser = getGroup.members.find((val) => val == payload.username);
      if (checkUser) {
        return "already member of the community";
      }
      const updatedGroup: Communities = {
        ...getGroup,
        members: [...getGroup.members, payload.username],
      };
      communitiesStorage.insert(payload.groupName, updatedGroup);
      return `successfully joined ${payload.groupName} communities`;
    }),
    //exit community group
    existGroup: update(
      [exitCommunityPayload],
      Result(text, communityAppErrors),
      (payload) => {
        if (!payload.groupName || !payload.username) {
          return Err({ credentialsMissing: "some credentials are missing" });
        }
        //check if user and community group both exist
        const getUser = userStorages.get(payload.username).Some;
        if (!getUser) {
          return Err({
            UserDoesNotExist: `user with ${payload.username} doest not exist`,
          });
        }
        //check if community group  exist
        const getGroup = communitiesStorage.get(payload.groupName).Some;
        if (!getGroup) {
          return Err({
            communityDoesNotExist: `community with ${payload.groupName} doest not exist`,
          });
        }
        //check if user is in the community group
        const checkUser = getGroup.members.find((val) => val == payload.username);
        if (!checkUser) {
          return Err({
            UserDoesNotExist: `user with ${payload.username} doest not exist in the community group`,
          });
        }
        //exit community group
        const updatedCommunity: Communities = {
          ...getGroup,
          members: getGroup.members.filter((val) => payload.username !== val),
        };
        communitiesStorage.insert(payload.groupName, updatedCommunity);
        return Ok("successfully existed the group");
      }
    ),
    //owner o community group remove a user from the community group
    removeUser: update(
      [removeUserPayload],
      Result(text, communityAppErrors),
      (payload) => {
        if (!payload.nameOfCommunity || !payload.owner || !payload.user) {
          return Err({ credentialsMissing: "some credentials are missings" });
        }
        //verify its the owner removing user
        const getCommunity = communitiesStorage.get(payload.nameOfCommunity).Some;
        if (!getCommunity) {
          return Err({
            communityDoesNotExist: `community ${payload.nameOfCommunity} deos not exist`,
          });
        }
        if (getCommunity.owner.toText() !== payload.owner.toText()) {
          return Err({ onlyOwnerCanDelete: "only owner can remove users" });
        }
        //check if user is registered
        const getUser = userStorages.get(payload.user).Some;
        if (!getUser) {
          return Err({
            UserDoesNotExist:
              "you must been registered inorder to send messages to the community",
          });
        }
        //check if user is in the community group
        const checkUser = getCommunity.members.find((val) => val == payload.user);
        if (!checkUser) {
          return Err({
            UserDoesNotExist: `user with ${payload.user} doest not exist in the group`,
          });
        }
        const updatedCommunity: Communities = {
          ...getCommunity,
          members: getCommunity.members.filter((val) => payload.user !== val),
        };
        communitiesStorage.insert(payload.nameOfCommunity, updatedCommunity);
        return Ok(`successfully removed ${payload.user}`);
      }
    ),
  
    //send a message to the cmmunity group
    sendMesageToGroup: update(
      [sendMessagePayLoad],
      Result(text, communityAppErrors),
      (payload) => {
        if (!payload.communityName || !payload.messageToSend) {
          return Err({ credentialsMissing: "missing credentials" });
        }
        const getCommunity = communitiesStorage.get(payload.communityName).Some;
        if (!getCommunity) {
          return Err({
            communityDoesNotExist: `community ${payload.communityName} does not exist`,
          });
        }
        //check if user is registered
        const getUser = userStorages.get(payload.username).Some;
        if (!getUser) {
          return Err({
            UserDoesNotExist:
              "you must been registered inorder to send messages to the community",
          });
        }
        //check if user is a member of the community  group
        const checkUser = getCommunity.members.find(
          (val) => val == payload.username
        );
        if (!checkUser) {
          return Err({
            NotAMemberOfGroup: `user with ${payload.username} not a member of the group`,
          });
        }
        const newMessage: message = {
          id: generateId(),
          sender: ic.caller(),
          messageText: payload.messageToSend,
          createdAt: ic.time(),
        };
        const updateCommunity: Communities = {
          ...getCommunity,
          messages: [...getCommunity.messages, newMessage],
        };
        communitiesStorage.insert(payload.communityName, updateCommunity);
        return Ok("message sent successfully");
      }
    ),
    //get all messages from the group
    getAllMessageFromCommunity: query(
      [messageRetriverPayLoad],
      Result(Vec(message), communityAppErrors),
      (payload) => {
        if (!payload.groupname || !payload.username) {
          return Err({ credentialsMissing: "some credentials are missing" });
        }
        //check if user is registered
        const getUser = userStorages.get(payload.username).Some;
        if (!getUser) {
          return Err({
            UserDoesNotExist:
              "you must been registered inorder to send messages to the community",
          });
        }
        //chck if user is a member of the community and also if community exist
        const getCommunity = communitiesStorage.get(payload.groupname).Some;
        if (!getCommunity) {
          return Err({
            communityDoesNotExist: `community ${payload.groupname} does not exist`,
          });
        }
        //check if user is in the group
        const checkUser = getCommunity.members.find(
          (val) => val == payload.username
        );
        if (!checkUser) {
          return Err({ NotAMemberOfGroup: "you are not a member of the group" });
        }
  
        return Ok(getCommunity.messages);
      }
    ),
  });
  
  //function to generate Principals ids
  
  function generateId(): Principal {
    const randomBytes = new Array(29)
      .fill(0)
      .map((_) => Math.floor(Math.random() * 256));
    return Principal.fromUint8Array(Uint8Array.from(randomBytes));
  }
  